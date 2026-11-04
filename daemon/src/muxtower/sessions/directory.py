"""Every session, whatever its source: local tmux sessions plus the optional other sources.

The one place that knows which source a session lives in. Routes and the stream ask it; it checks the
session's capabilities and hands the action to the local services or to the owning source, so a client
gets a 409 instead of keys sent to the wrong place.
"""

from collections.abc import Callable
from typing import Literal

from muxtower.approval.models import Answers, ApprovalResult
from muxtower.approval.service import ApprovalService
from muxtower.errors import Conflict, NotFound
from muxtower.sessions.anchors import ProjectAnchors
from muxtower.sessions.archive import SessionArchive
from muxtower.sessions.decorate import decorate
from muxtower.sessions.images import ImageFile, read_shown
from muxtower.sessions.marks import SessionMarks
from muxtower.sessions.merged import merged
from muxtower.sessions.models import AlsoWriting, Conversation, Session, UpdateSession
from muxtower.sessions.naming import AgentName, as_seen, chosen
from muxtower.sessions.owner_marks import OwnerMarks
from muxtower.sessions.ports import ClaudeProcessPort, SessionSourcePort
from muxtower.sessions.service import SessionService
from muxtower.sessions.transcripts import Transcripts
from muxtower.summaries.service import SummaryService
from muxtower.teams.ports import Checkout, TeamRecord
from muxtower.terminal.models import Resize, Screen, SendInput
from muxtower.terminal.service import TerminalService

Capability = Literal["screen", "conversation", "resize", "terminate", "rename", "archive", "place"]
WHAT = {
    "screen": "a terminal screen", "conversation": "a structured conversation", "resize": "resizing",
    "terminate": "stopping", "rename": "renaming", "archive": "archiving", "place": "placing",
}  # fmt: skip

IMAGE_ITEMS = 2000  # how far back in a conversation its images can be read


def _as_listed(session: Session, listed_as: dict[str, str]) -> Session:
    """A fork names its parent's Remote Control id; a parent in tmux here is listed under its own."""
    parent = listed_as.get(session.fork_of or "")
    return session.model_copy(update={"fork_of": parent}) if parent else session


class SessionDirectory(OwnerMarks):
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
        accounts: Callable[[Session], str | None] | None = None,
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
        self.anchors = ProjectAnchors()
        self.accounts = accounts  # the account a session here runs as (`agents/accounts.py`)
        self.concierge_id: str | None = None  # set by the concierge service once its session runs
        self.team: Callable[[str], TeamRecord | None] | None = None  # set by the team service: a session's role
        self.checkout: Callable[[str], Checkout] | None = None  # set by the team service: git, per folder here
        self.writing: Callable[[str], list[AlsoWriting]] | None = None  # set by the app: `writes/`

    # --- reading ------------------------------------------------------------------------------

    def source_of(self, session_id: str) -> SessionSourcePort | None:
        return next((s for s in self.sources if s.owns(session_id)), None)

    def _decorate(self, session: Session) -> Session:
        return decorate(session, self)

    def _linked(self, local: Session) -> Session:
        """A tmux session whose Claude Code also runs Remote Control is listed once (`merged`)."""
        source = self.source_of(local.remote_id) if local.remote_id else None
        if source is None or local.remote_id is None:
            return local
        try:
            record = self.local.repo.get(local.id)
            live = self.local.live.get(local.id)
            remote = source.get(local.remote_id)
            title, origin = (live.title, live.title_origin) if live else (None, None)
            origin = as_seen(record, title, origin) if record else origin
            if remote.name and title and remote.name != title:  # named on Remote Control's side, by someone
                title, origin = remote.name, AgentName("user")
            ours = record is not None and chosen(record, title, origin)[1]
            return merged(local, remote, named=ours)
        except NotFound:
            return local

    def _locals(self) -> list[Session]:
        return [self._linked(s) for s in self.local.list()]

    def list(self) -> list[Session]:
        """Every session once: one reported by two sources (a Remote Control session a node reports
        too) is listed from the one that owns it (`source_of`), and one merged into another entry (a
        tmux pane that also runs Remote Control, here or on a node) under that entry."""
        listed = [(source, v) for source in self.sources for v in source.views()]
        if self.archive_store:
            self.archive_store.revive(v for _, v in listed)
        ended = self.archive_store.ended() if self.archive_store else set()
        locals_ = [s for s in self._locals() if s.id not in ended]
        remotes = [(source, v) for source, v in listed if v.id not in ended]
        merged_into = {s.remote_id for s in locals_ if s.remote_id} | {v.remote_id for _, v in remotes if v.remote_id}
        kept = [v for source, v in remotes if v.id not in merged_into and self.source_of(v.id) is source]
        archived = self.archive_store.views() if self.archive_store else []
        listed_as = {s.remote_id: s.id for s in locals_ if s.remote_id}
        live = self.anchors.apply(self._decorate(_as_listed(s, listed_as)) for s in locals_ + kept)
        return live + [_as_listed(s, listed_as) for s in archived]

    def get(self, session_id: str) -> Session:
        found = self._get(session_id)
        if found.fork_of:
            found = _as_listed(found, {s.remote_id: s.id for s in self.local.list() if s.remote_id})
        return found

    def _get(self, session_id: str) -> Session:
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

    def image(self, session_id: str, path: str) -> ImageFile:
        """An image its conversation shows, read here if the session runs here (`sessions/images.py`)."""
        return read_shown(path, self.conversation(session_id, 0, IMAGE_ITEMS).items, self.get(session_id).on_host)

    def transcript_paths(self) -> dict[str, str]:
        """Local sessions and the transcript their conversation is read from."""
        return {s.id: path for s in self.local.list() if (path := self.local.transcript_of(s.id))}

    def screen(self, session_id: str, history: int) -> Screen:
        self.require(session_id, "screen")
        return self.terminal.screen(session_id, history)

    def watch_screen(self, session_id: str, history: int, watching: bool) -> None:
        """A client starts or stops watching a screen (the stream, on the event loop: never blocks)."""
        if watching:
            self.terminal.monitor.add_viewer(session_id, history)
        else:
            self.terminal.monitor.remove_viewer(session_id, history)

    # --- actions ------------------------------------------------------------------------------

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
        if body.images and not session.capabilities.images:
            raise Conflict("this session takes no images")
        if source is None and remote is not None and session.remote_id and body.text is not None:
            # Also on Remote Control: send the message there, structured, instead of typing it into a
            # terminal that may be showing a dialog.
            remote.send_text(session.remote_id, body.text, body.images)
        elif source is None:
            self.terminal.send(session_id, body)
        elif body.text is not None:
            source.send_text(session_id, body.text, body.images)  # a message is sent whole; `enter` is implied
        elif body.key is not None:
            source.send_key(session_id, body.key)

    def approve(self, session_id: str, option: str | None, answers: Answers | None = None) -> ApprovalResult:
        source = self.source_of(session_id)
        if source is None:
            return self.approvals.approve(session_id, option, answers=answers)
        state, picked = source.approve(session_id, option, answers)
        return ApprovalResult(session_id=session_id, state=state, option=picked)

    def deny(self, session_id: str) -> ApprovalResult:
        source = self.source_of(session_id)
        if source is None:
            return self.approvals.deny(session_id)
        return ApprovalResult(session_id=session_id, state=source.deny(session_id), option=None)
