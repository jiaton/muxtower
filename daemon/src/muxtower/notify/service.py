import asyncio
import hashlib
import logging
import threading
import time
from collections.abc import Callable
from typing import Any, Literal

from muxtower.infra.bus import EventBus
from muxtower.notify.models import PushPayload, Subscribe, Subscription
from muxtower.notify.ports import PushSender, ShownStore, StoredSubscription, SubscriptionRepository
from muxtower.notify.text import attention_text, done_text, interrupted_text, login_expired_text
from muxtower.runtimes.models import AgentState
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.models import NotifyLevel, Session, SessionRole

logger = logging.getLogger("muxtower.push")


WATCHING_SECONDS = 45  # a client looked at the session this recently: someone is watching it
APPLE_PUSH = "push.apple.com"  # iOS and iPadOS: a push that shows nothing loses the subscription
CLEAR_SECONDS = 30.0  # how often settled notifications are taken away, all of a device's at once
NOTIFIED_KEPT = 64  # sessions remembered as notified about, for telling devices when they are settled
NOTIFIED_SECONDS = 86_400
CLEAR_LOG_SECONDS = 600.0  # a device's clearing decision is logged when it changes, else this often


class PushService:
    def __init__(
        self, repo: SubscriptionRepository, sender: PushSender, sessions: SessionDirectory, daemon_name: str,
        paired: Callable[[str], bool], store: ShownStore | None = None,
    ) -> None:  # fmt: skip
        self.repo = repo
        self.sender = sender
        self.sessions = sessions
        self.daemon_name = daemon_name
        self.paired = paired  # whether a device is still paired: a revoked one's subscriptions stop
        self._notified: dict[str, float] = {}  # session id -> when it was last notified about
        # Per subscription: the sessions its device was last shown a notification of, not said settled since.
        self._shown: dict[str, dict[str, float]] = {}
        self._lock = threading.Lock()  # pushes go out from worker threads
        # Kept over a restart (a daemon updated between a notification and its session being read would
        # otherwise never take it away): epoch seconds.
        self.store = store
        if store is not None:
            self._notified, self._shown = store.load()
        self._clear_logged: dict[str, tuple[str, float]] = {}  # per subscription: what was last logged, when

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
        """A session finished a turn: to devices that take finished turns (`done`), for a session set to all.
                Not for one set to notify only when it needs the owner: it does that through its prompts (approvals,
                questions, plans, trust, a message to deliver), never a finished turn. A turn's summary cannot say
                whom it asks (a teammate's report ends with a question too). Nor for one whose turns are read as they
        end (`auto_read`: its turn is settled already), the assistant (its replies are
                the conversation itself), a session someone is watching, or one the owner hid."""
        view = self.sessions.find(session_id)
        if view is None or view.needs_attention or view.state == AgentState.BUSY or view.role == SessionRole.CONCIERGE:
            return 0
        if view.notify != NotifyLevel.ALL or view.auto_read:
            return 0
        marks = self.sessions.marks
        if view.hidden or (marks and marks.seen_within(session_id, WATCHING_SECONDS)):
            return 0
        title, body = done_text(view)
        return self._send(view, "done", title, body, lambda sub: sub.done)

    def notify_interrupted(self, count: int) -> int:
        """A restart interrupted sessions here (`recovery/`): to every device, once per restart."""
        title, body = interrupted_text(self.daemon_name, count)
        return self._to_all("recovery", title, body)

    def notify_trigger(self, name: str, body: str) -> int:
        """A trigger's news (its event, or trouble with it): to every device; its newest replaces its last."""
        return self._to_all("trigger", f"Trigger {name}"[:80], body[:300], trigger=name)

    def notify_inbox(self, title: str, body: str, item_id: int) -> int:
        """An Inbox item fell due (a reminder, or a hand-off that went out or could not): to every device; one
        per item."""
        return self._to_all("inbox", title[:80], body[:300], inbox_item=item_id)

    def _to_all(
        self, kind: Literal["login", "recovery", "trigger", "inbox"], title: str, body: str,
        trigger: str | None = None, inbox_item: int | None = None,
    ) -> int:  # fmt: skip
        sent = 0
        for sub in self._paired():
            payload = PushPayload(
                client_ref=sub.client_ref,
                daemon_name=self.daemon_name,
                kind=kind,
                title=title,
                body=body,
                trigger=trigger,
                inbox_item=inbox_item,
            )
            if self.sender.send(sub, payload.model_dump_json()):
                sent += 1
            else:
                self.repo.delete(sub.id)
        return sent

    def notify_login_expired(self) -> int:
        """The Claude login this daemon reads Remote Control with stopped working: to every device, once
        (`RemoteControlSource` says so when it breaks, not on every poll)."""
        title, body = login_expired_text(self.daemon_name)
        return self._to_all("login", title, body)

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
        now = time.time()
        with self._lock:
            recent = [sid for sid, at in self._notified.items() if now - at <= NOTIFIED_SECONDS and sid != sending]
        return [session_id for session_id in recent if self._is_settled(session_id)]

    def _send(
        self, view: Session, kind: Literal["attention", "done"], title: str, body: str,
        wants: Callable[[StoredSubscription], bool],
    ) -> int:  # fmt: skip
        settled = self._settled(view.id)
        told: list[str] = []  # the subscriptions this push went to
        for sub in self._paired():
            if not wants(sub) or view.id in sub.muted:
                continue
            payload = PushPayload(
                client_ref=sub.client_ref, daemon_name=self.daemon_name, session_id=view.id,
                session_name=view.name, state=view.state, kind=kind, title=title[:80], body=body[:300],
                settled=settled,
            )  # fmt: skip
            if self.sender.send(sub, payload.model_dump_json()):
                told.append(sub.id)
                logger.info(
                    "pushed %s of %s to %s (%s); settled named: %s", kind, view.id, sub.device or "?", sub.id[:8],
                    ", ".join(settled) or "none",
                )  # fmt: skip
            else:
                self.repo.delete(sub.id)
        if told:
            with self._lock:
                now = time.time()
                # Only where it went: a device this push skipped (it takes no finished turns, or mutes this
                # session) still shows the settled ones, and its clearing push (`clear_settled`) takes them.
                for sub_id in told:
                    shown = self._shown.setdefault(sub_id, {})
                    for session_id in settled:
                        shown.pop(session_id, None)
                    shown[view.id] = now
                for session_id in [*settled, view.id]:
                    self._notified.pop(session_id, None)
                self._notified[view.id] = now  # newest last: the oldest is the first to go
                while len(self._notified) > NOTIFIED_KEPT:
                    del self._notified[next(iter(self._notified))]
                self._save()
        return len(told)

    def _save(self) -> None:
        """Under the lock: what is remembered, written down (a subscription gone is forgotten with it)."""
        if self.store is None:
            return
        live = {sub.id for sub in self.repo.list()}
        self._shown = {sub: shown for sub, shown in self._shown.items() if sub in live and shown}
        try:
            self.store.save(self._notified, self._shown)
        except Exception:  # noqa: BLE001 - kept in memory all the same
            logger.exception("could not keep the notifications shown")

    def _log_clear(self, sub: StoredSubscription, decision: str) -> None:
        """A device's clearing decision, at INFO: when it changes, else every CLEAR_LOG_SECONDS."""
        now = time.monotonic()
        last = self._clear_logged.get(sub.id)
        if last is not None and last[0] == decision and now - last[1] < CLEAR_LOG_SECONDS:
            return
        self._clear_logged[sub.id] = (decision, now)
        logger.info("clearing notifications on %s (%s): %s", sub.device or "?", sub.id[:8], decision)

    def clear_settled(self) -> int:
        """Blocking. Takes away, on each device, the notifications of sessions read, answered or gone since,
        when the device goes on showing another of this daemon's: a push must leave something on screen
        (Chrome shows a notice of its own when one does not; iOS revokes the subscription), so a device whose
        every notification is settled keeps them until its next push says so, or the app is opened there.
        Never to Apple's push service. Returns how many devices were told."""
        told = 0
        for sub in self._paired():
            if APPLE_PUSH in sub.endpoint:
                continue
            with self._lock:
                shown = dict(self._shown.get(sub.id, {}))
            if not shown:
                self._log_clear(sub, "none shown")
                continue
            settled = [sid for sid in shown if self._is_settled(sid)]
            names = ", ".join(settled)
            # Which ones this daemon believes the device shows, to set against what the device logged
            # (`push-clear` diagnostics): ids only.
            believed = f"; shown: {', '.join(shown)}"
            if not settled:
                self._log_clear(sub, f"{len(shown)} shown, none settled{believed}")
                continue
            if len(settled) == len(shown):
                self._log_clear(sub, f"all {len(shown)} shown are settled ({names}): kept until a push or the app")
                continue
            payload = PushPayload(
                client_ref=sub.client_ref, daemon_name=self.daemon_name, kind="clear", title="", body="",
                settled=settled,
            )  # fmt: skip
            if not self.sender.send(sub, payload.model_dump_json()):
                self._log_clear(sub, f"the clear push for {names} was refused: subscription dropped")
                self.repo.delete(sub.id)
                continue
            told += 1
            self._log_clear(sub, f"sent: {len(settled)} of {len(shown)} shown settled ({names}){believed}")
            with self._lock:
                for session_id in settled:
                    self._shown.get(sub.id, {}).pop(session_id, None)
                self._save()
        return told

    def _is_settled(self, session_id: str) -> bool:
        view = self.sessions.find(session_id)
        return view is None or not (view.unread or view.needs_attention)

    async def _finished(self, session_id: str) -> None:
        try:
            await asyncio.to_thread(self.notify_done, session_id)
        except Exception:
            logger.exception("push dispatch failed")

    async def run_loop(self, bus: EventBus) -> None:
        queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        bus.subscribe("attention:*", queue)
        bus.subscribe("done:*", queue)
        bus.subscribe("claude-login:*", queue)
        bus.subscribe("recovery:*", queue)
        waiting: set[asyncio.Task[None]] = set()  # finished turns waiting for their summary
        clearing = asyncio.create_task(self._clear_loop())  # noqa: F841, RUF006 - lives as long as this loop
        while True:
            topic, payload = await queue.get()
            kind, session_id = topic.split(":", 1)
            if kind == "recovery":
                try:
                    await asyncio.to_thread(self.notify_interrupted, int(payload or 0))
                except Exception:
                    logger.exception("push dispatch failed")
                continue
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

    async def _clear_loop(self) -> None:
        """Every CLEAR_SECONDS: notifications that no longer matter, taken away where that is safe."""
        while True:
            await asyncio.sleep(CLEAR_SECONDS)
            try:
                await asyncio.to_thread(self.clear_settled)
            except Exception:
                logger.exception("clearing notifications failed")
