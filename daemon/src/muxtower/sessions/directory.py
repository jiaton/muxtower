"""Every session, whatever its source: local tmux sessions plus the optional other sources.

The one place that knows which source a session lives in. Routes and the stream ask it; it checks the
session's capabilities and hands the action to the local services or to the owning source, so a client
gets a 409 instead of keys sent to the wrong place.
"""

from typing import Literal

from muxtower.approval.models import ApprovalResult
from muxtower.approval.service import ApprovalService
from muxtower.errors import Conflict, NotFound
from muxtower.sessions.models import Conversation, Session, SessionRole, UpdateSession
from muxtower.sessions.ports import ClaudeProcessPort, SessionSource, SessionSourcePort
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


def _deeper(start: str, working: str) -> str:
    """Where an agent works: the folder it started in, or the folder it works in when that lies inside
    (an agent started in ~/projects that works in ~/projects/web belongs to web)."""
    if start and working.startswith(start.rstrip("/") + "/"):
        return working
    return start or working


class SessionDirectory:
    def __init__(
        self,
        local: SessionService,
        terminal: TerminalService,
        approvals: ApprovalService,
        sources: list[SessionSourcePort],
        summaries: SummaryService | None = None,
        hub_name: str = "",
        processes: ClaudeProcessPort | None = None,
    ) -> None:
        self.local = local
        self.terminal = terminal
        self.approvals = approvals
        self.sources = sources
        self.summaries = summaries
        self.hub_name = hub_name
        self.processes = processes
        self.concierge_id: str | None = None  # set by the concierge service once its session runs

    # --- reading ------------------------------------------------------------------------------

    def source_of(self, session_id: str) -> SessionSourcePort | None:
        return next((s for s in self.sources if s.owns(session_id)), None)

    def _decorate(self, session: Session) -> Session:
        """What the sources leave open: the machine (and folder) of everything that runs on this hub,
        the reply summary, the concierge role."""
        update: dict[str, object] = {}
        if session.source != SessionSource.REMOTE_CONTROL:
            update["machine"] = self.hub_name or session.machine
        elif self.processes and (process := self.processes.running().get(session.id)):
            update["machine"] = self.hub_name or session.machine
            update["cwd"] = _deeper(process.cwd, session.cwd)
        if self.summaries and (summary := self.summaries.lookup(session.last_message)):
            update["reply_summary"] = summary
        if self.concierge_id and session.id == self.concierge_id:
            update["role"] = SessionRole.CONCIERGE
        return session.model_copy(update=update) if update else session

    def _linked(self, local: Session) -> Session:
        """A tmux session whose Claude Code also runs Remote Control is listed once: the tmux entry, with
        the remote side's name, conversation, summary and origin."""
        source = self.source_of(local.remote_id) if local.remote_id else None
        if source is None or local.remote_id is None:
            return local
        try:
            remote = source.get(local.remote_id)
        except NotFound:
            return local
        return local.model_copy(
            update={
                "name": remote.name,
                "origin": remote.origin,
                "summary": remote.summary,
                "unread": remote.unread,
                # The remote log knows when the agent last did something; the local clock restarts
                # with the daemon.
                "updated_at": remote.updated_at,
                "cwd": _deeper(local.cwd, remote.cwd),
                "last_message": local.last_message or remote.last_message,
                "capabilities": local.capabilities.model_copy(update={"conversation": True}),
            }
        )

    def _locals(self) -> list[Session]:
        return [self._linked(s) for s in self.local.list()]

    def list(self) -> list[Session]:
        locals_ = self._locals()
        linked = {s.remote_id for s in locals_ if s.remote_id}
        remotes = [v for source in self.sources for v in source.views() if v.id not in linked]
        return [self._decorate(s) for s in locals_ + remotes]

    def get(self, session_id: str) -> Session:
        source = self.source_of(session_id)
        if source is None:
            return self._decorate(self._linked(self.local.get(session_id)))
        # A remote id whose agent also runs in tmux here answers with the one merged entry.
        merged = next((s for s in self._locals() if s.remote_id == session_id), None)
        return self._decorate(merged or source.get(session_id))

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
        session = self.require(session_id, "conversation")
        remote_id = session.remote_id or session_id  # a tmux session's conversation comes from its remote side
        source = self.source_of(remote_id)
        assert source is not None  # only sources have conversations today
        return source.conversation(remote_id, after, limit).model_copy(update={"session_id": session_id})

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
        remote = self.source_of(session.remote_id) if session.remote_id else None
        if source is None and remote is not None and session.remote_id and body.text is not None:
            # Also on Remote Control: send the message there, structured, instead of typing it into a
            # terminal that may be showing a dialog.
            remote.send_text(session.remote_id, body.text)
        elif source is None:
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
