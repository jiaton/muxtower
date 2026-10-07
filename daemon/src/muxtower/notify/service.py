import asyncio
import hashlib
import logging
from typing import Any

from muxtower.infra.bus import EventBus
from muxtower.notify.models import PushPayload, Subscribe, Subscription
from muxtower.notify.ports import PushSender, SubscriptionRepository
from muxtower.runtimes.models import AgentState
from muxtower.sessions.service import SessionService

logger = logging.getLogger("muxtower.push")

TITLES = {
    AgentState.NEEDS_PERMISSION: "Approval needed",
    AgentState.NEEDS_ANSWER: "Question for you",
    AgentState.NEEDS_TRUST: "Trust prompt",
    AgentState.PLAN_REVIEW: "Plan ready for review",
    AgentState.ERROR: "Agent error",
}


class PushService:
    def __init__(
        self, repo: SubscriptionRepository, sender: PushSender, sessions: SessionService, daemon_name: str
    ) -> None:
        self.repo = repo
        self.sender = sender
        self.sessions = sessions
        self.daemon_name = daemon_name

    def subscribe(self, body: Subscribe) -> Subscription:
        sub_id = hashlib.sha256(body.endpoint.encode()).hexdigest()[:24]
        self.repo.upsert(sub_id, body)
        return Subscription(id=sub_id, client_ref=body.client_ref, states=body.states, muted=body.muted)

    def unsubscribe(self, sub_id: str) -> bool:
        return self.repo.delete(sub_id)

    def notify(self, session_id: str) -> int:
        record = self.sessions.repo.get(session_id)
        if record is None:
            return 0
        view = self.sessions.view(record)
        if not view.needs_attention:
            return 0
        detail = view.pending.detail if view.pending and view.pending.detail else None
        body = f"{view.name}: {detail}" if detail else view.name
        sent = 0
        for sub in self.repo.list():
            if view.state not in sub.states or session_id in sub.muted:
                continue
            payload = PushPayload(
                client_ref=sub.client_ref, daemon_name=self.daemon_name, session_id=session_id,
                session_name=view.name, state=view.state, title=TITLES.get(view.state, "muxtower"),
                body=body[:240],
            )  # fmt: skip
            if self.sender.send(sub, payload.model_dump_json()):
                sent += 1
            else:
                self.repo.delete(sub.id)
        return sent

    async def run_loop(self, bus: EventBus) -> None:
        queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        bus.subscribe("attention:*", queue)
        while True:
            topic, _ = await queue.get()
            try:
                await asyncio.to_thread(self.notify, topic.split(":", 1)[1])
            except Exception:
                logger.exception("push dispatch failed")
