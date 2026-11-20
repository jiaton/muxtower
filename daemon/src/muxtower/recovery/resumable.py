"""Whether an archived session can be started again here, and if not why (`RecoveryService.resume`): it
ran here in tmux, its runtime resumes, its conversation's id was kept and its transcript is still here, its
folder too. The archived list asks this of every archived session each time it is listed: what was found
of a conversation is kept until the files say it may have changed."""

import json
import os
import threading
import time
from collections.abc import Callable
from typing import Any

from muxtower.errors import Invalid
from muxtower.sessions.interrupted import agent_id_of
from muxtower.sessions.models import ResumeBlock, Session
from muxtower.sessions.ports import ArchiveRecord, SessionSource
from muxtower.sessions.service import SessionService

# How long whether an archived session's conversation is found holds while nothing says it changed: a
# transcript rewritten in place (a `continued-in` added) changes no folder.
FOUND_SECONDS = 30.0
RAN_HERE = (SessionSource.LAUNCHED, SessionSource.ADOPTED)  # in tmux: what muxtower can start again
NOT_OURS = "muxtower never ran it: it ran in Claude's app or on Remote Control only, so start it there"


def relaunch_of(record: ArchiveRecord) -> dict[str, Any]:
    """What starts it again, as kept (`SessionArchive.keep`)."""
    try:
        kept = json.loads(record.relaunch or "{}")
    except ValueError:
        kept = {}
    return kept if isinstance(kept, dict) else {}


class Resumability:
    def __init__(self, sessions: SessionService, processes: Any, node_online: Callable[[str], bool]) -> None:
        self.sessions = sessions
        self.processes = processes  # finds a conversation's transcript, and where it went on
        self.node_online = node_online
        # Per archived session: whether its conversation was found, while its record (the same object: a
        # change replaces it) and the files and remote ids (`resumable_all`'s stamp) stay the same.
        self._found: dict[str, tuple[ArchiveRecord, object, float, ResumeBlock | None]] = {}
        self._found_lock = threading.Lock()

    def agent_of(self, record: ArchiveRecord, view: Session, formers: dict[str, str] | None = None) -> str | None:
        """The agent's own id of an archived session's conversation: as kept, else its transcript's name,
        else from what a Remote Control session of it left; then where it went on (`continued-in`)."""
        agent = relaunch_of(record).get("agent_id") or agent_id_of(record.transcript)
        if agent is None and self.processes is not None:
            formers = self.sessions.repo.remote_ids() if formers is None else formers
            remote_ids = [r for r, s in formers.items() if s == view.id]
            for remote_id in filter(None, [record.remote_id, *remote_ids]):
                if agent := self.processes.agent_for_remote(remote_id):
                    break
        if agent and view.runtime == "claude-code" and self.processes is not None:
            latest = self.processes.transcript_for(agent)
            agent = agent_id_of(latest) or agent if latest else agent
        return agent

    def _transcript_gone(self, record: ArchiveRecord, view: Session, agent: str) -> bool:
        if view.runtime == "claude-code" and self.processes is not None:
            return self.processes.transcript_for(agent) is None
        return bool(record.transcript) and not os.path.exists(record.transcript or "")

    def resumable(self, record: ArchiveRecord, view: Session) -> ResumeBlock | None:
        """None when it can be started again; else why not (`ResumeBlock`). A node's is told by its node; here
        only whether that node is online. Its files read now (`resumable_all`)."""
        return self.resumable_all([(record, view)])[0]

    def resumable_all(self, archived: list[tuple[ArchiveRecord, Session]]) -> list[ResumeBlock | None]:
        """`resumable` for each, the files looked at once for all of them: what was found of a conversation
        is kept until a transcript or process file comes or goes, a session's remote ids change, or
        `FOUND_SECONDS` pass."""
        stamp: list[object] = []  # read once, when the first needs it
        formers: dict[str, str] = {}

        def current() -> object:
            if not stamp:
                formers.update(self.sessions.repo.remote_ids())
                ask = getattr(self.processes, "stamp", None)
                files = ask() if ask else None
                stamp.append((files, frozenset(formers.items())))
            return stamp[0]

        blocks = [self._resumable(record, view, current, formers) for record, view in archived]
        if len(archived) > 1:  # a whole list: those no longer archived are let go
            ids = {record.session_id for record, _ in archived}
            with self._found_lock:
                self._found = {k: v for k, v in self._found.items() if k in ids}
        return blocks

    def _resumable(
        self, record: ArchiveRecord, view: Session, current: Callable[[], object], formers: dict[str, str]
    ) -> ResumeBlock | None:
        if view.node:
            if not self.node_online(view.node):
                return ResumeBlock(code="offline", reason=f"{view.node} is offline: it can be started again there")
            return None
        if view.source not in RAN_HERE:
            return ResumeBlock(code="not_ours", reason=NOT_OURS)
        try:
            runtime = self.sessions.resolve_runtime(view.runtime)
        except Invalid:
            runtime = None
        if runtime is None or not runtime.config.resume:
            return ResumeBlock(code="runtime", reason=f"{view.runtime} conversations cannot be resumed")
        blocked = self._found_block(record, view, current, formers)
        if blocked:
            return blocked
        if not os.path.isdir(view.cwd or ""):
            return ResumeBlock(code="folder", reason=f"its folder {view.cwd} is gone: pick another")
        return None

    def _found_block(
        self, record: ArchiveRecord, view: Session, current: Callable[[], object], formers: dict[str, str]
    ) -> ResumeBlock | None:
        """Why its conversation cannot be found here, if it cannot: kept per `resumable_all`. Only Claude
        Code's lookups are kept (the others' are one file's existence: asked each time)."""
        if view.runtime != "claude-code":
            return self._find(record, view, current, formers)
        stamp, now = current(), time.monotonic()
        with self._found_lock:
            known = self._found.get(record.session_id)
        if known and known[0] is record and known[1] == stamp and now - known[2] < FOUND_SECONDS:
            return known[3]
        blocked = self._find(record, view, current, formers)
        with self._found_lock:
            self._found[record.session_id] = (record, stamp, now, blocked)
        return blocked

    def _find(
        self, record: ArchiveRecord, view: Session, current: Callable[[], object], formers: dict[str, str]
    ) -> ResumeBlock | None:
        current()  # the files read now, before they are looked in (`ClaudeProcesses.stamp`)
        agent = self.agent_of(record, view, formers)
        if agent is None:
            return ResumeBlock(code="transcript", reason="its conversation's id was not kept, so it cannot be found")
        if self._transcript_gone(record, view, agent):
            return ResumeBlock(code="transcript", reason="its conversation's transcript is gone from this machine")
        return None
