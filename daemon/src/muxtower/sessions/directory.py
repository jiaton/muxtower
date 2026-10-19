"""Every session, whatever its source: local tmux sessions plus the optional other sources.

The one place that knows which source a session lives in. Routes and the stream ask it; it checks the
session's capabilities and hands the action to the local services or to the owning source, so a client
gets a 409 instead of keys sent to the wrong place.
"""

from typing import Literal

from muxtower.approval.models import ApprovalResult
from muxtower.approval.service import ApprovalService
from muxtower.errors import Conflict, NotFound
from muxtower.sessions.models import Conversation, Session, UpdateSession
from muxtower.sessions.ports import SessionSourcePort
from muxtower.sessions.service import SessionService
from muxtower.summaries.service import SummaryService
from muxtower.terminal.models import Resize, Screen, SendInput
from muxtower.terminal.service import TerminalService

Capability = Literal["screen", "conversation", "resize", "terminate", "rename"]
WHAT = {
    "screen": "a terminal screen",
    "conversation": "a structured conversation",
    "resize": "resizing",
    "terminate": "stopping",
    "rename": "renaming",
}


class SessionDirectory:
    def __init__(
        self,
        local: SessionService,
        terminal: TerminalService,
        approvals: ApprovalService,
        sources: list[SessionSourcePort],
        summaries: SummaryService | None = None,
    ) -> None:
        self.local = local
        self.terminal = terminal
        self.approvals = approvals
        self.sources = sources
        self.summaries = summaries

    # --- reading ------------------------------------------------------------------------------

    def source_of(self, session_id: str) -> SessionSourcePort | None:
        return next((s for s in self.sources if s.owns(session_id)), None)

    def _with_summary(self, session: Session) -> Session:
        summary = self.summaries.lookup(session.last_message) if self.summaries else None
        return session.model_copy(update={"reply_summary": summary}) if summary else session

    def list(self) -> list[Session]:
        sessions = self.local.list() + [view for source in self.sources for view in source.views()]
        return [self._with_summary(s) for s in sessions]

    def get(self, session_id: str) -> Session:
        source = self.source_of(session_id)
        return self._with_summary(source.get(session_id) if source else self.local.get(session_id))

    def find(self, session_id: str) -> Session | None:
        try:
            return self.get(session_id)
        except NotFound:
            return None

    def require(self, session_id: str, capability: Capability) -> Session:
        session = self.get(session_id)
        if not getattr(session.capabilities, capability):
            raise Conflict(f"{WHAT[capability]} is not available for this session")
        return session

    def conversation(self, session_id: str, after: int, limit: int) -> Conversation:
        self.require(session_id, "conversation")
        source = self.source_of(session_id)
        assert source is not None  # only sources have conversations today
        return source.conversation(session_id, after, limit)

    def screen(self, session_id: str, history: int) -> Screen:
        self.require(session_id, "screen")
        return self.terminal.screen(session_id, history)

    # --- actions ------------------------------------------------------------------------------

    def update(self, session_id: str, patch: UpdateSession) -> Session:
        if self.source_of(session_id) is not None:  # no source offers either today
            raise Conflict("renaming and auto-approve are not available for this session")
        return self.local.update(session_id, patch)  # checks the runtime for auto-approve

    def terminate(self, session_id: str) -> None:
        if self.source_of(session_id) is not None:
            self.require(session_id, "terminate")  # no source stops sessions yet
        self.local.terminate(session_id)  # explains itself for sessions muxtower did not start

    def resize(self, session_id: str, body: Resize) -> None:
        self.require(session_id, "resize")
        self.terminal.resize(session_id, body)

    def release_size(self, session_id: str) -> None:
        if self.get(session_id).capabilities.resize:  # nothing to give back otherwise
            self.terminal.release(session_id)

    def send_input(self, session_id: str, body: SendInput) -> None:
        session = self.get(session_id)
        keys = session.capabilities.keys
        if body.key is not None and keys and body.key not in keys:
            raise Conflict(f"this session takes only these keys: {', '.join(keys)}")
        source = self.source_of(session_id)
        if source is None:
            self.terminal.send(session_id, body)
        elif body.text is not None:
            source.send_text(session_id, body.text)  # a message is sent whole; `enter` is implied
        elif body.key is not None:
            source.send_key(session_id, body.key)

    def approve(self, session_id: str, option: str | None) -> ApprovalResult:
        source = self.source_of(session_id)
        if source is None:
            return self.approvals.approve(session_id, option)
        state, picked = source.approve(session_id, option)
        return ApprovalResult(session_id=session_id, state=state, option=picked)

    def deny(self, session_id: str) -> ApprovalResult:
        source = self.source_of(session_id)
        if source is None:
            return self.approvals.deny(session_id)
        return ApprovalResult(session_id=session_id, state=source.deny(session_id), option=None)
