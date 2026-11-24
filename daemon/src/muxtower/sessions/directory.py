"""Every session, whatever its source: local tmux sessions plus the optional other sources.

The one place that knows which source a session lives in. Routes and the stream ask it; it checks the
session's capabilities and hands the action to the local services or to the owning source, so a client
gets a 409 instead of keys sent to the wrong place.
"""

import builtins
import logging
import threading
import time
from collections.abc import Callable, Iterable, Sequence
from typing import Literal

from muxtower.approval.models import Answers, ApprovalResult
from muxtower.approval.service import ApprovalService
from muxtower.attachments.ports import Upload
from muxtower.attachments.store import as_pasted
from muxtower.errors import Conflict, NotFound
from muxtower.runtimes.models import AgentState
from muxtower.runtimes.spec import ANSI
from muxtower.sessions.anchors import ProjectAnchors
from muxtower.sessions.archive import SessionArchive
from muxtower.sessions.decorate import decorate
from muxtower.sessions.images import ImageFile, read_shown
from muxtower.sessions.marks import SessionMarks
from muxtower.sessions.merged import merged
from muxtower.sessions.models import AlsoWriting, Conversation, Session, UpdateSession
from muxtower.sessions.names import CODEX, REMOTE_CONTROL, NameSeen, SessionNames
from muxtower.sessions.naming import AgentName, as_seen, chosen
from muxtower.sessions.owner_marks import OwnerMarks
from muxtower.sessions.ports import ClaudeProcessPort, SessionSource, SessionSourcePort
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
PICTURES_ONLY = "this session takes pictures only"  # no pane here to paste a file's path into


def _as_listed(session: Session, listed_as: dict[str, str]) -> Session:
    """A fork names its parent's Remote Control id; a parent in tmux here is listed under its own. One
    whose "parent" is a Remote Control session its own agent ran before (the same conversation, resumed
    after a restart with a new bridge) is no fork."""
    parent = listed_as.get(session.fork_of or "")
    if parent == session.id:
        return session.model_copy(update={"fork_of": None, "side_chat": False})
    return session.model_copy(update={"fork_of": parent}) if parent else session


# The names a source gives its sessions, for the rename dialog (`names.py`).
SOURCE_NAMES = {
    SessionSource.REMOTE_CONTROL: REMOTE_CONTROL,
    SessionSource.CODEX: CODEX,
    SessionSource.CODEX_SHARED: CODEX,
}


logger = logging.getLogger("muxtower.sessions")


PROMPT_STATES = frozenset(
    {AgentState.NEEDS_PERMISSION, AgentState.NEEDS_ANSWER, AgentState.NEEDS_TRUST, AgentState.PLAN_REVIEW}
)


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
        self._bridges_noted: set[tuple[str, str]] = set()  # (session, bridge) already kept (`note_remote_ids`)
        self.name_store: SessionNames | None = None  # every name a session went by (`names.py`), set by the app
        self.accounts = accounts  # the account a session here runs as (`agents/accounts.py`)
        self.concierge_id: str | None = None  # set by the concierge service once its session runs
        self.team: Callable[[str], TeamRecord | None] | None = None  # set by the team service: a session's role
        self.checkout: Callable[[str], Checkout] | None = None  # set by the team service: git, per folder here
        self.writing: Callable[[str], list[AlsoWriting]] | None = None  # set by the app: `writes/`
        self._held: dict[str, list[SendInput]] = {}  # the owner's messages waiting for a prompt to go (`hold`)
        self._held_lock = threading.Lock()
        self.listed: Callable[[list[Session]], object] | None = None  # set by the app: told each new list
        self._listed: tuple[float, list[Session]] = (float("-inf"), [])  # the latest `list()`, and when it began
        self._listing = threading.RLock()  # one `list()` at a time: those that wait for it take its result

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
            if self.name_store:
                self.name_store.note(local.id, remote.name, REMOTE_CONTROL)
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

    def recent(self, max_age: float) -> list[Session]:
        """The latest `list()` when it is younger than `max_age` seconds (the stream lists at every change),
        else a new one: for those that look on their own schedule and can take one a little old."""
        at, found = self._listed
        return found[:] if time.monotonic() - at < max_age else self.list()

    def list(self) -> list[Session]:
        """Every session once: one reported by two sources (a Remote Control session a node reports
        too) is listed from the one that owns it (`source_of`), and one merged into another entry (a
        tmux pane that also runs Remote Control, here or on a node) under that entry.

        Every client's stream asks at every change, at once: one list is made at a time, and one begun
        after a caller asked is that caller's answer too (it read everything after the change)."""
        asked = time.monotonic()
        with self._listing:
            began, found = self._listed
            if began <= asked:
                began = time.monotonic()
                found = self._list()
                self._listed = (began, found)
                if self.listed is not None:
                    try:
                        self.listed(found)
                    except Exception:  # what is told of a list never keeps it from being listed
                        logger.exception("telling of a new list failed")
        return found[:]

    def _list(self) -> builtins.list[Session]:
        listed = [(source, v) for source in self.sources for v in source.views()]
        if self.archive_store:
            self.archive_store.revive(v for _, v in listed)
        ended = self.archive_store.ended() if self.archive_store else set()
        locals_ = [s for s in self._locals() if s.id not in ended]
        remotes = [(source, v) for source, v in listed if v.id not in ended]
        # Remote Control sessions a live session's agent ran before (`note_remote_ids`) are folded into it,
        # here or on a node.
        owners = {s.id for s in locals_} | {v.id for _, v in remotes if v.node is not None}
        formers = {r: sid for r, sid in self.local.repo.remote_ids().items() if sid in owners}
        merged_into = {s.remote_id for s in locals_ if s.remote_id} | {v.remote_id for _, v in remotes if v.remote_id}
        merged_into |= set(formers)
        kept = [v for source, v in remotes if v.id not in merged_into and self.source_of(v.id) is source]
        if self.name_store:
            for v in kept:
                if v.node is None and v.source in SOURCE_NAMES:
                    self.name_store.note(v.id, v.name, SOURCE_NAMES[v.source])
        archived = self.archive_store.views() if self.archive_store else []
        listed_as = formers | {s.remote_id: s.id for s in locals_ if s.remote_id}
        live = self.anchors.apply(self._decorate(_as_listed(s, listed_as)) for s in locals_ + kept)
        self._note_bridges(live)
        return live + [_as_listed(s, listed_as) for s in archived]

    def _note_bridges(self, live: Iterable[Session]) -> None:
        """Every session's Remote Control session, kept as its for good (a node's too: the hub lists them),
        so that once it has ended, its bridge goes with it (`ended_bridges.py`) instead of staying on its own."""
        new = [(s.id, s.remote_id) for s in live if s.remote_id and (s.id, s.remote_id) not in self._bridges_noted]
        for session_id, remote_id in new:
            self.local.repo.note_remote_ids(session_id, [remote_id])
            self._bridges_noted.add((session_id, remote_id))

    def get(self, session_id: str) -> Session:
        found = self._get(session_id)
        if found.fork_of:
            formers = self.local.repo.remote_ids()
            found = _as_listed(found, formers | {s.remote_id: s.id for s in self.local.list() if s.remote_id})
        return found

    def _get(self, session_id: str) -> Session:
        if self.archive_store and (archived := self.archive_store.get(session_id)):
            return archived
        source = self.source_of(session_id)
        if source is None:
            return self._decorate(self._linked(self.local.get(session_id)))
        # A remote id whose agent also runs in tmux here answers with the one merged entry.
        owner = self.local.repo.remote_ids().get(session_id)  # one its agent ran before: that session now
        merged = next((s for s in self._locals() if s.remote_id == session_id or s.id == owner), None)
        if merged is None and owner is not None and owner != session_id:  # a node's session: that one
            home = self.source_of(owner)
            if home is not None and home is not source:
                try:
                    merged = home.get(owner)
                except NotFound:
                    merged = None  # gone from its node: the bridge on its own
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

    def names(self, session_id: str) -> Sequence[NameSeen]:
        """Blocking. Its other names, latest first (`names.py`); its past ones read from its transcript once."""
        session = self.get(session_id)
        if self.name_store is None:
            return []
        self.name_store.backfill(session.id, self.local.transcript_of(session.id))
        return self.name_store.offered(session.id, session.name)

    def conversation(self, session_id: str, after: int, limit: int, around: int | None = None) -> Conversation:
        """From the transcript of the Claude Code in the session's pane (the whole history, also for one that
        runs Remote Control), else from the session's source. `around`: the items from that seq on, read
        where they are (a search led there): a transcript's, else as `after`."""
        session = self.require(session_id, "conversation")
        if session.archived_at and self.archive_store:
            record = self.archive_store.record(session_id)
            if around is not None and record and record.transcript and self.transcripts:
                return self.transcripts.window(session_id, record.transcript, around, limit)
            return self.archive_store.conversation(session_id, around - 1 if around else after, limit)
        path = self.local.transcript_of(session_id) if self.source_of(session_id) is None else None
        if path and self.transcripts:
            if around is not None:
                return self.transcripts.window(session_id, path, around, limit)
            return self.transcripts.conversation(session_id, path, after, limit)
        if around is not None:
            after = around - 1
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
        logger.info("session %s: fitted to %sx%s", session_id, body.cols, body.rows)  # a fit that bounces shows here
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
        if body.images and not session.capabilities.images:
            raise Conflict("this session takes no images")
        if body.attachments and source is not None:
            raise Conflict(PICTURES_ONLY)
        remote = self.source_of(session.remote_id) if session.remote_id else None
        if source is None and remote is not None and body.text is not None and session.runtime != "claude-code":
            # A Codex pane that is also a shared app-server thread: the message goes to the thread, whole
            # (its files' paths ahead of the words).
            files = self.terminal.attachments.paths(session_id, body.attachments)
            text = "".join(as_pasted(path) for path in files) + body.text
            remote.send_text(session.remote_id or "", text, body.images)
        elif source is None:
            # A session in tmux here: typed (or pasted) into its pane. A Claude Code one also on Remote Control
            # included: sent over Remote Control, Claude Code (2.1.3xx) takes a message for one from another
            # Claude session, asks the owner to approve it, and tells the agent it is not from its user.
            self.terminal.send(session_id, body)
        elif body.text is not None:
            source.send_text(session_id, body.text, body.images)  # a message is sent whole; `enter` is implied
        elif body.key is not None:
            source.send_key(session_id, body.key)

    def upload(self, session_id: str, name: str, media_type: str) -> Upload:
        """A file for a message to this session, saved here (`attachments/`): only for one in a pane here."""
        session = self.get(session_id)
        if session.archived_at:
            raise Conflict("this session is archived")
        if self.source_of(session_id) is not None:
            raise Conflict(PICTURES_ONLY)
        return self.terminal.attachments.begin(session_id, name, media_type)

    def at_prompt(self, session_id: str) -> bool:
        """A Claude Code pane (here or on a node) showing a dialog (permission, question, trust, plan): typed
        into, the words would go nowhere and Enter would pick its first choice. Not one only on Remote
        Control, whose messages go in structured."""
        session = self.get(session_id)
        if session.source is SessionSource.REMOTE_CONTROL or not session.capabilities.screen:
            return False
        return session.runtime == "claude-code" and session.state in PROMPT_STATES

    def dialog_now(self, session_id: str) -> bool:
        """Blocking. A pane here showing a dialog right now, read again from its screen: the state the last
        look saw can be a moment old, and a dialog that came up since (a tip right after a turn) would take
        what is typed. Only before typing words into one; a session elsewhere is checked where it runs."""
        if self.source_of(session_id) is not None:
            return False
        try:
            record = self.local.record(session_id)
        except NotFound:
            return False
        runtime = self.local.runtime_of(record)
        if runtime is None or runtime.name != "claude-code":  # as `at_prompt`
            return False
        text = self.local.tmux.capture(record.pane)
        return text is not None and runtime.classify(text).state in PROMPT_STATES

    def accept_suggestion(self, session_id: str, text: str) -> None:
        """Send the prompt its agent suggests (`Session.suggestion`), as it is: read again from its screen
        first, still that one, its input line still empty and no dialog up; else nothing is sent."""
        if (source := self.source_of(session_id)) is not None:
            if not hasattr(source, "accept_suggestion"):
                raise Conflict("this session has no suggested prompt to send")
            return source.accept_suggestion(session_id, text)  # type: ignore[no-any-return]
        record = self.local.record(session_id)
        runtime = self.local.runtime_of(record)
        said = runtime.config.suggestion if runtime else None
        if runtime is None or said is None:
            raise Conflict("this agent suggests no prompts")
        if self.get(session_id).state not in (AgentState.IDLE, AgentState.UNKNOWN):
            raise Conflict("it is not waiting at its prompt")
        ansi = self.local.tmux.capture(record.pane, ansi=True) or ""
        if runtime.classify(ANSI.sub("", ansi)).state in PROMPT_STATES:
            raise Conflict("it is showing a dialog")
        if runtime.suggestion_of(ansi) != text.strip():
            raise Conflict("that suggestion is no longer there")
        for step in said.accept:
            if step.key:
                self.local.tmux.send_key(record.pane, step.key)
            elif step.text:
                self.local.tmux.send_text(record.pane, step.text)
        self.terminal.monitor.wake()

    def send_or_hold(self, session_id: str, body: SendInput) -> bool:
        """The owner's message: typed in now, or, while its session shows a dialog (`at_prompt`), held and
        typed in once the dialog has gone (`deliver_held`), in the order sent. True when held."""
        dialog = body.text is not None and (self.at_prompt(session_id) or self.dialog_now(session_id))
        with self._held_lock:  # never held across a look at the pane
            if body.text is not None and (self._held.get(session_id) or dialog):
                if self.get(session_id).archived_at:
                    raise Conflict("this session is archived")
                self._held.setdefault(session_id, []).append(body)
                return True
        self.send_input(session_id, body)
        return False

    def deliver_held(self) -> None:
        """Blocking, after each look at the panes: what was held for a dialog goes in once it has gone; a
        session that ended drops what was held for it."""
        with self._held_lock:
            waiting = list(self._held)
        for session_id in waiting:
            session = self.find(session_id)
            if session is None or session.archived_at:
                with self._held_lock:
                    self._held.pop(session_id, None)
                continue
            if self.at_prompt(session_id) or self.dialog_now(session_id):
                continue
            with self._held_lock:
                bodies = self._held.pop(session_id, [])
            for i, body in enumerate(bodies):
                try:
                    self.send_input(session_id, body)
                except Exception:  # noqa: BLE001 - kept, tried again at the next look
                    logger.warning("a held message to %s did not go in yet", session_id)
                    with self._held_lock:
                        self._held[session_id] = bodies[i:] + self._held.get(session_id, [])
                    break

    def held(self, session_id: str) -> int:
        with self._held_lock:
            return len(self._held.get(session_id, []))

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
