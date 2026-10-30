import asyncio
import hashlib
import logging
import threading
import time
from collections.abc import Callable
from typing import Any, Literal

from muxtower.infra.bus import EventBus
from muxtower.notify.models import PushPayload, Subscribe, Subscription
from muxtower.notify.ports import PushSender, StoredSubscription, SubscriptionRepository
from muxtower.notify.text import attention_text, done_text, login_expired_text
from muxtower.runtimes.models import AgentState
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.models import NotifyLevel, Session, SessionRole, TurnSummary

logger = logging.getLogger("muxtower.push")


WATCHING_SECONDS = 45  # a client looked at the session this recently: someone is watching it
SUMMARY_WAIT_SECONDS = 60.0  # how long a finished turn's summary may take to come
SUMMARY_POLL_SECONDS = 3.0
NOTIFIED_KEPT = 64  # sessions remembered as notified about, for telling devices when they are settled
NOTIFIED_SECONDS = 86_400


def summarized(summary: TurnSummary | None) -> bool:
    """The platform wrote its account of the turn that just ended (it says "working" during one)."""
    return summary is not None and summary.status not in (None, "working")


def asks_for_owner(summary: TurnSummary | None) -> bool:
    return summary is not None and (bool(summary.needs) or summary.status == "need_input")


class PushService:
    def __init__(
        self, repo: SubscriptionRepository, sender: PushSender, sessions: SessionDirectory, daemon_name: str,
        paired: Callable[[str], bool],
    ) -> None:  # fmt: skip
        self.repo = repo
        self.sender = sender
        self.sessions = sessions
        self.daemon_name = daemon_name
        self.paired = paired  # whether a device is still paired: a revoked one's subscriptions stop
        self._notified: dict[str, float] = {}  # session id -> when it was last notified about
        self._lock = threading.Lock()  # pushes go out from worker threads

    def subscribe(self, body: Subscribe, device: str) -> Subscription:
        sub_id = hashlib.sha256(body.endpoint.encode()).hexdigest()[:24]
        self.repo.upsert(sub_id, body, device)
        return Subscription(id=sub_id, client_ref=body.client_ref, states=body.states, done=body.done, muted=body.muted)

    def unsubscribe(self, sub_id: str) -> bool:
        return self.repo.delete(sub_id)

    def notify(self, session_id: str) -> int:
        """A session entered a state that needs the owner."""
        view = self.sessions.find(session_id)
        if view is None or not view.needs_attention or view.notify == NotifyLevel.OFF:
            return 0
        title, body = attention_text(view)
        return self._send(view, "attention", title, body, lambda sub: view.state in sub.states)

    def notify_done(self, session_id: str) -> int:
        """A session finished a turn. Not for the assistant (its replies are the conversation itself), a
        session someone is watching, or one the owner hid. One set to notify only when it needs them does
        when the turn's summary asks for them, also to devices that take no other finished turns."""
        view = self.sessions.find(session_id)
        if view is None or view.needs_attention or view.state == AgentState.BUSY or view.role == SessionRole.CONCIERGE:
            return 0
        asks = asks_for_owner(view.summary)
        if view.notify == NotifyLevel.NEEDS:
            logger.info("session %s finished a turn %s", session_id, "that asks for you" if asks else "quietly")
        if view.notify == NotifyLevel.OFF or (view.notify == NotifyLevel.NEEDS and not asks):
            return 0
        marks = self.sessions.marks
        if view.hidden or (marks and marks.seen_within(session_id, WATCHING_SECONDS)):
            return 0
        title, body = done_text(view)
        needs_only = view.notify == NotifyLevel.NEEDS
        return self._send(view, "done", title, body, lambda sub: sub.done or needs_only)

    def notify_login_expired(self) -> int:
        """The Claude login this daemon reads Remote Control with stopped working: to every device, once
        (`RemoteControlSource` says so when it breaks, not on every poll)."""
        title, body = login_expired_text(self.daemon_name)
        sent = 0
        for sub in self._paired():
            payload = PushPayload(
                client_ref=sub.client_ref, daemon_name=self.daemon_name, kind="login", title=title, body=body
            )
            if self.sender.send(sub, payload.model_dump_json()):
                sent += 1
            else:
                self.repo.delete(sub.id)
        return sent

    def _paired(self) -> list[StoredSubscription]:
        """Subscriptions of devices still paired; the others' are dropped."""
        paired = []
        for sub in self.repo.list():
            if sub.device is None or not self.paired(sub.device):
                logger.info("dropping the push subscription of %s: no longer paired", sub.device)
                self.repo.delete(sub.id)
            else:
                paired.append(sub)
        return paired

    def _settled(self, sending: str) -> list[str]:
        """Sessions notified about that the owner has seen (read) or answered since. A push cannot be sent
        just to take a notification away (iOS revokes a subscription whose pushes show nothing; Chrome
        shows one of its own), so the next push that is sent anyway says which ones can go."""
        now = time.monotonic()
        with self._lock:
            recent = [sid for sid, at in self._notified.items() if now - at <= NOTIFIED_SECONDS and sid != sending]
        settled = []
        for session_id in recent:
            view = self.sessions.find(session_id)
            if view is None or not (view.unread or view.needs_attention):
                settled.append(session_id)
        return settled

    def _send(
        self, view: Session, kind: Literal["attention", "done"], title: str, body: str,
        wants: Callable[[StoredSubscription], bool],
    ) -> int:  # fmt: skip
        sent = 0
        settled = self._settled(view.id)
        for sub in self._paired():
            if not wants(sub) or view.id in sub.muted:
                continue
            payload = PushPayload(
                client_ref=sub.client_ref, daemon_name=self.daemon_name, session_id=view.id,
                session_name=view.name, state=view.state, kind=kind, title=title[:80], body=body[:300],
                settled=settled,
            )  # fmt: skip
            if self.sender.send(sub, payload.model_dump_json()):
                sent += 1
            else:
                self.repo.delete(sub.id)
        if sent:
            with self._lock:
                for session_id in [*settled, view.id]:
                    self._notified.pop(session_id, None)
                self._notified[view.id] = time.monotonic()  # newest last: the oldest is the first to go
                while len(self._notified) > NOTIFIED_KEPT:
                    del self._notified[next(iter(self._notified))]
        return sent

    def _waits_for_summary(self, session_id: str) -> bool:
        """Blocking. A session set to notify only when it needs the owner, whose summary of the turn it
        just finished has not come yet."""
        view = self.sessions.find(session_id)
        return (
            view is not None and view.notify == NotifyLevel.NEEDS and view.state != AgentState.BUSY
            and not view.needs_attention and view.summary is not None and not summarized(view.summary)
        )  # fmt: skip

    async def _finished(self, session_id: str) -> None:
        """Whether it needs the owner is in the turn's summary, which the platform writes after the turn."""
        waited = 0.0
        while waited < SUMMARY_WAIT_SECONDS and await asyncio.to_thread(self._waits_for_summary, session_id):
            await asyncio.sleep(SUMMARY_POLL_SECONDS)
            waited += SUMMARY_POLL_SECONDS
        try:
            await asyncio.to_thread(self.notify_done, session_id)
        except Exception:
            logger.exception("push dispatch failed")

    async def run_loop(self, bus: EventBus) -> None:
        queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        bus.subscribe("attention:*", queue)
        bus.subscribe("done:*", queue)
        bus.subscribe("claude-login:*", queue)
        waiting: set[asyncio.Task[None]] = set()  # finished turns waiting for their summary
        while True:
            topic, _ = await queue.get()
            kind, session_id = topic.split(":", 1)
            if kind == "claude-login":
                try:
                    await asyncio.to_thread(self.notify_login_expired)
                except Exception:
                    logger.exception("push dispatch failed")
                continue
            if kind == "done":
                task = asyncio.create_task(self._finished(session_id))
                waiting.add(task)
                task.add_done_callback(waiting.discard)
                continue
            try:
                await asyncio.to_thread(self.notify, session_id)
            except Exception:
                logger.exception("push dispatch failed")
