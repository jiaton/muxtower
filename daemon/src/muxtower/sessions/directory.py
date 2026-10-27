"""Every session, whatever its source: local tmux sessions plus the optional other sources.

The one place that knows which source a session lives in. Routes and the stream ask it; it checks the
session's capabilities and hands the action to the local services or to the owning source, so a client
gets a 409 instead of keys sent to the wrong place.
"""

import logging
from typing import Literal

from muxtower.approval.models import ApprovalResult
from muxtower.approval.service import ApprovalService
from muxtower.errors import Conflict, NotFound, Unavailable
from muxtower.sessions.archive import SessionArchive
from muxtower.sessions.marks import SessionMarks
from muxtower.sessions.merged import deeper, merged
from muxtower.sessions.models import Conversation, NotifyLevel, Placement, Session, SessionRole, UpdateSession
from muxtower.sessions.ports import ClaudeProcessPort, SessionSource, SessionSourcePort
from muxtower.sessions.service import SessionService
from muxtower.sessions.transcripts import Transcripts
from muxtower.summaries.service import SummaryService
from muxtower.terminal.models import Resize, Screen, SendInput
from muxtower.terminal.service import TerminalService

logger = logging.getLogger("muxtower.sessions")

Capability = Literal["screen", "conversation", "resize", "terminate", "rename", "archive", "place"]
WHAT = {
    "screen": "a terminal screen", "conversation": "a structured conversation", "resize": "resizing",
    "terminate": "stopping", "rename": "renaming", "archive": "archiving", "place": "placing",
}  # fmt: skip


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
        marks: SessionMarks | None = None,
        transcripts: Transcripts | None = None,
        archive: SessionArchive | None = None,
    ) -> None:
        self.local = local
        self.terminal = terminal
        self.approvals = approvals
        self.sources = sources
        self.summaries = summaries
        self.hub_name = hub_name
        self.processes = processes
        self.marks = marks
        self.transcripts = transcripts
        self.archive_store = archive
        self.concierge_id: str | None = None  # set by the concierge service once its session runs

    # --- reading ------------------------------------------------------------------------------

    def source_of(self, session_id: str) -> SessionSourcePort | None:
        return next((s for s in self.sources if s.owns(session_id)), None)

    def _decorate(self, session: Session) -> Session:
        """What the sources leave open: the machine, folder and origin of everything that runs on this
        hub, the owner's marks (unread, hidden, where they placed it), the reply summary, the concierge role."""
        update: dict[str, object] = {}
        marks = self.marks.get(session.id) if self.marks else None
        if self.marks and marks:
            update["unread"] = self.marks.unread(session.id, session.unread, session.updated_at)
            update["finished_at"] = marks.finished_at
            update["hidden"] = marks.hidden
            update["notify"] = NotifyLevel(marks.notify)
        if session.source != SessionSource.REMOTE_CONTROL:
            update["machine"] = self.hub_name or session.machine
        elif self.processes and (process := self.processes.running().get(session.id)):
            update["machine"] = self.hub_name or session.machine
            update["cwd"] = deeper(process.cwd, session.cwd)
            update["origin"] = process.origin or session.origin  # what Claude Code says beats the tags
        if self.summaries and (summary := self.summaries.lookup(session.last_message)):
            update["reply_summary"] = summary
        if marks and (marks.machine or marks.folder):  # the owner knows best
            update["placement"] = Placement(machine=marks.machine, folder=marks.folder)
            update["machine"] = marks.machine or update.get("machine", session.machine)
            update["cwd"] = marks.folder or update.get("cwd", session.cwd)
        if self.concierge_id and session.id == self.concierge_id:
            update["role"] = SessionRole.CONCIERGE
            update["capabilities"] = session.capabilities.model_copy(update={"archive": False})  # it is restarted
        return session.model_copy(update=update) if update else session

    def _linked(self, local: Session) -> Session:
        """A tmux session whose Claude Code also runs Remote Control is listed once (`merged`)."""
        source = self.source_of(local.remote_id) if local.remote_id else None
        if source is None or local.remote_id is None:
            return local
        try:
            return merged(local, source.get(local.remote_id))
        except NotFound:
            return local

    def _locals(self) -> list[Session]:
        return [self._linked(s) for s in self.local.list()]

    def list(self) -> list[Session]:
        ended = self.archive_store.ended() if self.archive_store else set()
        locals_ = [s for s in self._locals() if s.id not in ended]
        skip = ended | {s.remote_id for s in locals_ if s.remote_id}
        remotes = [v for source in self.sources for v in source.views() if v.id not in skip]
        archived = self.archive_store.views() if self.archive_store else []
        return [self._decorate(s) for s in locals_ + remotes] + archived

    def get(self, session_id: str) -> Session:
        if self.archive_store and (archived := self.archive_store.get(session_id)):
            return archived
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
        """From the transcript of the Claude Code in the session's pane (the whole history, also for one that
        runs Remote Control), else from the session's source."""
        session = self.require(session_id, "conversation")
        if session.archived_at and self.archive_store:
            return self.archive_store.conversation(session_id, after, limit)
        path = self.local.transcript_of(session_id) if self.source_of(session_id) is None else None
        if path and self.transcripts:
            return self.transcripts.conversation(session_id, path, after, limit)
        remote_id = session.remote_id or session_id
        if source := self.source_of(remote_id):
            return source.conversation(remote_id, after, limit).model_copy(update={"session_id": session_id})
        raise Conflict("this session has no conversation to read")

    def transcript_paths(self) -> dict[str, str]:
        """Local sessions and the transcript their conversation is read from."""
        return {s.id: path for s in self.local.list() if (path := self.local.transcript_of(s.id))}

    def screen(self, session_id: str, history: int) -> Screen:
        self.require(session_id, "screen")
        return self.terminal.screen(session_id, history)

    # --- actions ------------------------------------------------------------------------------

    def hide(self, session_id: str, hidden: bool) -> None:
        """Out of the lists (or back in), for every source."""
        session = self.get(session_id)
        if self.marks is not None:
            self.marks.hide(session.id, hidden)

    def set_notify(self, session_id: str, level: NotifyLevel) -> Session:
        """Which push notifications it sends, for every source."""
        session = self.get(session_id)
        if self.marks is not None:
            self.marks.set_notify(session.id, level.value)
        return self.get(session_id)

    def mark_read(self, session_id: str, read: bool) -> None:
        """Read: the owner looked at it, here and (best effort) in the Claude apps. Unread: to come back to."""
        session = self.get(session_id)
        if self.marks is None:
            return
        if not read:
            self.marks.mark_unread(session.id)
            return
        self.marks.seen(session.id)
        remote_id = session.remote_id or session.id
        source = self.source_of(remote_id)
        if source is not None and source.get(remote_id).unread:  # clients repeat this; ask only when needed
            try:
                source.mark_read(remote_id)
            except Unavailable as exc:
                logger.warning("could not mark %s read on its source: %s", remote_id, exc)

    def update(self, session_id: str, patch: UpdateSession) -> Session:
        if self.source_of(session_id) is not None:  # no source offers either today
            raise Conflict("renaming and auto-approve are not available for this session")
        return self.local.update(session_id, patch)  # checks the runtime for auto-approve

    def terminate(self, session_id: str) -> None:
        """Stops it; an archived session is deleted from the archive instead."""
        if self.archive_store and self.archive_store.get(session_id):
            self.archive_store.delete(session_id)
            return
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
        if session.archived_at:
            raise Conflict("this session is archived")
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
