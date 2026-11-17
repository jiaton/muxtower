"""Starting again the sessions whose machine restarted under them (`sessions/interrupted.py` tells them
apart and keeps them). Each is started in its folder with the options it was started with, resuming its
conversation, under its own id: its name, marks, role, project and tasks stay with it. Nothing is sent to
it, so it does not carry on working by itself.

`recovery.mode`: ask (the app lists them, all ticked, and the owner starts again those they keep ticked;
a push says so), auto (started again as soon as they are found), off (let go, as before). A node keeps
and starts its own: the hub asks it over the link (`recover`).

An archived session is started again the same way (`resume`): on the machine it ran on, in its folder (or
another the owner gives when it is gone), its conversation resumed (Claude Code's by where it went on last,
`continued-in`), under its own id, so its name, role, project, pins and notifications are its own again;
it leaves Archived. `resumable` says when it cannot, and why."""

import asyncio
import json
import logging
import os
from collections.abc import Callable
from datetime import datetime
from typing import Any

from muxtower.config import RecoverySettings
from muxtower.errors import Conflict, Invalid, NotFound
from muxtower.infra.bus import EventBus
from muxtower.sessions.archive import SessionArchive
from muxtower.sessions.interrupted import agent_id_of, resume_args
from muxtower.sessions.models import ResumeBlock, Session
from muxtower.sessions.ports import ArchiveRecord, SessionRecord, SessionSource
from muxtower.sessions.service import SessionService
from muxtower.terminal.ports import PaneRef

logger = logging.getLogger("muxtower.recovery")

CHECK_SECONDS = 30.0  # besides every change of the session list
RAN_HERE = (SessionSource.LAUNCHED, SessionSource.ADOPTED)  # in tmux: what muxtower can start again
NOT_OURS = "muxtower never ran it: it ran in Claude's app or on Remote Control only, so start it there"


def _relaunch(record: ArchiveRecord) -> dict[str, Any]:
    try:
        kept = json.loads(record.relaunch or "{}")
    except ValueError:
        kept = {}
    return kept if isinstance(kept, dict) else {}


def _local_id(session_id: str) -> str:
    return session_id.rsplit("~", 1)[-1]  # a node's session as the hub lists it: <node>~<its id there>


class RecoveryService:
    def __init__(
        self, sessions: SessionService, settings: RecoverySettings,
        on_node: Callable[[str], bool] = lambda _: False, ask_node: Callable[[str], Session] | None = None,
        archive: SessionArchive | None = None, processes: Any = None,
    ) -> None:  # fmt: skip
        self.sessions = sessions
        self.settings = settings
        self.on_node = on_node  # a node's session, as the hub lists it
        self.ask_node = ask_node  # starts one again on its node
        self.archive = archive
        self.processes = processes  # finds a conversation's transcript, and where it went on
        # The hub's: whether a node is online, and asking one to start an archived session again.
        self.node_online: Callable[[str], bool] = lambda _: False
        self.ask_node_resume: Callable[[str, str, str | None], Session] | None = None
        self._told: set[str] = set()  # interrupted sessions already handled for `mode`
        if archive is not None:
            archive.judge = self.resumable

    def interrupted(self) -> list[Session]:
        """The sessions here that wait to be started again."""
        return [self.sessions.view(r) for r in self.sessions.repo.list() if r.interrupted_at]

    def recover(self, session_ids: list[str]) -> list[Session]:
        """Blocking. Starts each again (here, or on its node); those that are not interrupted are skipped."""
        started = []
        for session_id in dict.fromkeys(session_ids):
            if self.on_node(session_id):
                if self.ask_node is None:
                    raise Conflict(f"{session_id} runs on a node, which this daemon cannot ask")
                started.append(self.ask_node(session_id))
                continue
            record = self.sessions.repo.get(session_id)
            if record is None:
                raise NotFound(f"unknown session {session_id}")
            if record.interrupted_at is None:
                continue  # running already (started again by someone else meanwhile)
            runtime = self.sessions.runtime_of(record)
            if runtime is None:
                raise Conflict(f"{record.runtime} is no longer a runtime here")
            args = resume_args(record, runtime.config)
            logger.info("starting %s (%s) again: %s", record.id, record.name, " ".join(args) or "(no arguments)")
            started.append(self.sessions.launch(runtime, record.cwd, args, None, hooks=True, again=record))
        return started

    # --- archived sessions ---------------------------------------------------------------------

    def _agent_of(self, record: ArchiveRecord, view: Session) -> str | None:
        """The agent's own id of an archived session's conversation: as kept, else its transcript's name,
        else from what a Remote Control session of it left; then where it went on (`continued-in`)."""
        agent = _relaunch(record).get("agent_id") or agent_id_of(record.transcript)
        if agent is None and self.processes is not None:
            remote_ids = [r for r, s in self.sessions.repo.remote_ids().items() if s == view.id]
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
        only whether that node is online."""
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
        agent = self._agent_of(record, view)
        if agent is None:
            return ResumeBlock(code="transcript", reason="its conversation's id was not kept, so it cannot be found")
        if self._transcript_gone(record, view, agent):
            return ResumeBlock(code="transcript", reason="its conversation's transcript is gone from this machine")
        if not os.path.isdir(view.cwd or ""):
            return ResumeBlock(code="folder", reason=f"its folder {view.cwd} is gone: pick another")
        return None

    def resume(self, session_id: str, cwd: str | None = None) -> Session:
        """Blocking. Starts an archived session again (here, or on its node), its conversation resumed, under
        its own id; it leaves Archived. `cwd`: another folder, when its own is gone. Conflict says why not."""
        if self.archive is None or (record := self.archive.record(session_id)) is None:
            raise NotFound(f"{session_id} is not archived")
        view = Session.model_validate_json(record.session)
        node = view.node
        if node is None and self.on_node(session_id) and (found := self.archive.get(session_id)):
            node = found.node
        if node:
            if self.ask_node_resume is None:
                raise Conflict(f"{session_id} ran on {node}, which this daemon cannot ask")
            if not self.node_online(node):
                raise Conflict(f"{node} is offline: it can be started again once it is back")
            started = self.ask_node_resume(node, _local_id(session_id), cwd)
            self.archive.delete(session_id)
            return started
        blocked = self.resumable(record, view)
        if cwd is not None:
            cwd = os.path.abspath(os.path.expanduser(cwd))
            if not os.path.isdir(cwd):
                raise Invalid(f"not a directory: {cwd}")
            if blocked and blocked.code == "folder":
                blocked = None
        if blocked:
            raise Conflict(blocked.reason)
        runtime = self.sessions.resolve_runtime(view.runtime)
        kept = _relaunch(record)
        named_at = kept.get("named_at")
        again = SessionRecord(
            id=view.id, name=view.name, runtime=runtime.name, cwd=cwd or view.cwd or "", source=SessionSource.LAUNCHED,
            pane=PaneRef("", ""), tmux_session="", hook_token_hash=None,
            auto_approve=bool(kept.get("auto_approve")),
            created_at=datetime.fromisoformat(kept["created_at"]) if kept.get("created_at") else view.created_at,
            named=bool(kept.get("named", True)), named_at=datetime.fromisoformat(named_at) if named_at else None,
            launch_args=kept.get("launch_args"), agent_id=self._agent_of(record, view),
        )  # fmt: skip
        args = resume_args(again, runtime.config)
        logger.info("starting archived %s (%s) again: %s", again.id, again.name, " ".join(args))
        started = self.sessions.launch(runtime, again.cwd, args, None, hooks=True, again=again)
        self.archive.delete(session_id)
        return started

    def check(self) -> int:
        """Blocking. Handles the newly interrupted by `mode`; returns how many the owner is to be asked about."""
        found = {s.id for s in self.interrupted()}
        new = sorted(found - self._told)
        self._told &= found
        if not new:
            return 0
        self._told |= set(new)
        if self.settings.mode == "auto":
            self.recover(new)
            return 0
        if self.settings.mode == "off":
            for session_id in new:
                self.sessions.forget(session_id)
            return 0
        return len(new)

    async def run_loop(self, bus: EventBus) -> None:
        queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        bus.subscribe("sessions", queue)
        while True:
            try:
                asked = await asyncio.to_thread(self.check)
                if asked:
                    bus.publish("recovery:interrupted", asked)
                    bus.publish("sessions", None)
            except Exception:
                logger.exception("could not look at interrupted sessions")
            try:
                await asyncio.wait_for(queue.get(), CHECK_SECONDS)
            except TimeoutError:
                pass
