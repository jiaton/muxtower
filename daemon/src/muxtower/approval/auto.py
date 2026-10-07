"""Per-session auto-approve. Acts only on states the runtime marks safe, only when the dialog is
recognised on the live screen (strict), and never for a session the owner has not opted in."""

import asyncio
import logging
from typing import Any

from muxtower.approval.service import ApprovalService
from muxtower.errors import Conflict
from muxtower.infra.audit import AuditLog
from muxtower.infra.bus import EventBus

logger = logging.getLogger("muxtower.auto_approve")
RETRY_SECONDS = 0.5
RETRY_FOR_SECONDS = 6.0


class AutoApprover:
    def __init__(self, approvals: ApprovalService, audit: AuditLog) -> None:
        self.approvals = approvals
        self.audit = audit

    def _eligible(self, session_id: str) -> bool:
        sessions = self.approvals.sessions
        record = sessions.repo.get(session_id)
        if record is None or not record.auto_approve:
            return False
        runtime = sessions.runtime_of(record)
        state = sessions.effective(record).state
        return runtime is not None and state in runtime.config.auto_approve_states

    async def _try(self, session_id: str) -> None:
        for _ in range(int(RETRY_FOR_SECONDS / RETRY_SECONDS)):
            if not self._eligible(session_id):
                return
            try:
                result = await asyncio.to_thread(self.approvals.approve, session_id, None, True)
            except Conflict:
                await asyncio.sleep(RETRY_SECONDS)  # dialog not drawn yet
                continue
            self.audit.record("auto-approve", "approve", session_id, f"state={result.state}")
            return

    async def run_loop(self, bus: EventBus) -> None:
        queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        bus.subscribe("attention:*", queue)
        while True:
            topic, _ = await queue.get()
            session_id = topic.split(":", 1)[1]
            try:
                await self._try(session_id)
            except Exception:
                logger.exception("auto-approve failed for %s", session_id)
