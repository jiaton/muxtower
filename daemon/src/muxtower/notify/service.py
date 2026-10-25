import asyncio
import hashlib
import logging
from collections.abc import Callable
from typing import Any, Literal

from muxtower.infra.bus import EventBus
from muxtower.notify.models import PushPayload, Subscribe, Subscription
from muxtower.notify.ports import PushSender, StoredSubscription, SubscriptionRepository
from muxtower.notify.text import attention_text, done_text
from muxtower.runtimes.models import AgentState
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.models import Session, SessionRole

logger = logging.getLogger("muxtower.push")


class PushService:
    def __init__(
        self, repo: SubscriptionRepository, sender: PushSender, sessions: SessionDirectory, daemon_name: str
    ) -> None:
        self.repo = repo
        self.sender = sender
        self.sessions = sessions
        self.daemon_name = daemon_name

    def subscribe(self, body: Subscribe) -> Subscription:
        sub_id = hashlib.sha256(body.endpoint.encode()).hexdigest()[:24]
        self.repo.upsert(sub_id, body)
        return Subscription(id=sub_id, client_ref=body.client_ref, states=body.states, done=body.done, muted=body.muted)

    def unsubscribe(self, sub_id: str) -> bool:
        return self.repo.delete(sub_id)

    def notify(self, session_id: str) -> int:
        """A session entered a state that needs the owner."""
        view = self.sessions.find(session_id)
        if view is None or not view.needs_attention:
            return 0
        title, body = attention_text(view)
        return self._send(view, "attention", title, body, lambda sub: view.state in sub.states)

    def notify_done(self, session_id: str) -> int:
        """A session finished a turn. Not for the assistant: its replies are the conversation itself."""
        view = self.sessions.find(session_id)
        if view is None or view.needs_attention or view.state == AgentState.BUSY or view.role == SessionRole.CONCIERGE:
            return 0
        title, body = done_text(view)
        return self._send(view, "done", title, body, lambda sub: sub.done)

    def _send(
        self, view: Session, kind: Literal["attention", "done"], title: str, body: str,
        wants: Callable[[StoredSubscription], bool],
    ) -> int:  # fmt: skip
        sent = 0
        for sub in self.repo.list():
            if not wants(sub) or view.id in sub.muted:
                continue
            payload = PushPayload(
                client_ref=sub.client_ref, daemon_name=self.daemon_name, session_id=view.id,
                session_name=view.name, state=view.state, kind=kind, title=title[:80], body=body[:300],
            )  # fmt: skip
            if self.sender.send(sub, payload.model_dump_json()):
                sent += 1
            else:
                self.repo.delete(sub.id)
        return sent

    async def run_loop(self, bus: EventBus) -> None:
        queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        bus.subscribe("attention:*", queue)
        bus.subscribe("done:*", queue)
        while True:
            topic, _ = await queue.get()
            kind, session_id = topic.split(":", 1)
            try:
                await asyncio.to_thread(self.notify if kind == "attention" else self.notify_done, session_id)
            except Exception:
                logger.exception("push dispatch failed")
