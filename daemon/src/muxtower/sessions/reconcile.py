"""The registry made to match tmux, every tick: a session whose pane is gone is forgotten (it ended) or kept
as interrupted (its tmux server restarted under it: `interrupted.py`), and an agent found running in a
pane nobody owns is adopted. Mixed into `Monitor`, which holds what it keeps between ticks.

A pane muxtower started always has its session: one not listed is asked for directly before its session is
let go (a listing can miss a pane that still runs), and a pane of muxtower's own (`mxt-…`, its id and hook
token in its tmux session's environment) whose session is missing, or kept as interrupted, gets it back
(`_restore`), under its own id, with its hooks wired again. Known by those marks, never by the command it
runs: on macOS, Claude Code's is its version."""

import hashlib
import logging
import os
import shlex
import time
from datetime import UTC, datetime

from muxtower.hooks.ports import MCP_TOKEN_ENV
from muxtower.runtimes.spec import Runtime
from muxtower.sessions.interrupted import gone
from muxtower.sessions.ports import SessionRecord, SessionSource
from muxtower.sessions.service import SessionService
from muxtower.terminal.ports import LaunchMarks, PaneInfo, PaneRef

logger = logging.getLogger("muxtower.monitor")

ASK_AGAIN_SECONDS = 600.0  # an mxt- pane found not to carry a session of ours is asked again after this
LAUNCHED_PREFIX = "mxt-"  # muxtower's tmux sessions: mxt-<the session id's first 8> (`SessionService.launch`)
SESSION_ENV, TOKEN_ENV = "MUXTOWER_SESSION_ID", "MUXTOWER_HOOK_TOKEN"  # noqa: S105 - names


def ours(marks: LaunchMarks) -> str | None:
    """The id of the session muxtower started this pane for, from what it left on it; None if it is not one."""
    session_id = marks.env.get(SESSION_ENV, "")
    good = len(session_id) >= 8 and session_id.isalnum()
    return session_id if good and marks.session_name == f"{LAUNCHED_PREFIX}{session_id[:8]}" else None


def runtime_started(command: str, runtimes: dict[str, Runtime]) -> Runtime | None:
    """The runtime whose binary a pane was started with (`env -u … claude …` too)."""
    try:
        words = shlex.split(command)
    except ValueError:
        words = command.split()
    by_binary = {rt.config.binary: rt for rt in runtimes.values()}
    return next((by_binary[w] for w in (os.path.basename(w) for w in words) if w in by_binary), None)


def display_name(pane: PaneInfo) -> str:
    """tmux names unnamed sessions 0, 1, 2…; the working directory says more than that."""
    if pane.session_name.isdigit():
        return os.path.basename(pane.cwd.rstrip("/")) or pane.cwd or f"tmux {pane.session_name}"
    return pane.session_name


class Reconciler:
    service: SessionService
    _panes: dict[tuple[str, str], PaneInfo]
    _captured: dict[str, tuple[float, float]]
    _seen_servers: dict[str, str]
    _not_ours: dict[tuple[str, str, int], float]  # unknown mxt- panes found to carry no session of ours: when

    def _adopted_record(self, pane: PaneInfo, runtime: str) -> SessionRecord:
        # Keyed by pane, not session name: renaming the tmux session must not make it a new session.
        digest = hashlib.sha256(f"{pane.socket}:{pane.pane_id}:{pane.pid}".encode()).hexdigest()
        return SessionRecord(
            id="a" + digest[:11],
            name=display_name(pane),
            runtime=runtime,
            cwd=pane.cwd,
            source=SessionSource.ADOPTED,
            pane=PaneRef(pane.socket, pane.pane_id),
            tmux_session=pane.session_name,
            hook_token_hash=None,
            auto_approve=False,
            created_at=datetime.now(UTC),
        )

    def _servers_alive(self, sockets: set[str]) -> dict[str, str]:
        """The tmux server on each socket with panes, read once a run (it is then known alive this run)."""
        for socket in sockets - self._seen_servers.keys():
            if server := self.service.tmux.server_id(socket):
                self._seen_servers[socket] = server
        return {s: self._seen_servers[s] for s in sockets if s in self._seen_servers}

    def reconcile(self) -> bool:
        svc = self.service
        # Records first, panes second: a session created while this runs is not in `records`, so its
        # pane cannot be missing from `panes` and it is never dropped as gone.
        records = svc.repo.list()
        sockets = dict.fromkeys([svc.config.socket, *svc.config.adopt_sockets])
        panes: list[PaneInfo] = []
        seen: set[tuple[str, str]] = set()
        for pane in (p for socket in sockets for p in svc.tmux.list_panes(socket)):
            key = (pane.server or pane.socket, pane.pane_id)
            if key not in seen:  # the same server reached under two names is scanned once
                seen.add(key)
                panes.append(pane)
        alive = {(p.socket, p.pane_id) for p in panes}
        self._panes = {(p.socket, p.pane_id): p for p in panes}
        changed = False

        servers = self._servers_alive({p.socket for p in panes})
        known: set[tuple[str, str]] = set()
        for record in records:
            key = (record.pane.socket, record.pane.pane_id)
            if record.interrupted_at:
                continue  # waits to be resumed; a new server's pane of the same id is not its
            if key in alive:
                known.add(key)
                server = servers.get(record.pane.socket)
                if server and record.server_id != server:  # learnt here for a session that predates it
                    record.server_id = server
                    svc.repo.upsert(record)
                continue
            if self._still_there(record):
                known.add(key)
                continue
            changed = True
            self._captured.pop(record.id, None)
            server = svc.tmux.server_id(record.pane.socket)
            keep = record.source == SessionSource.LAUNCHED or record.agent_id is not None
            if keep and gone(record, server, self._seen_servers.get(record.pane.socket)) == "interrupted":
                logger.info("session %s (%s) was interrupted (its tmux server restarted)", record.id, record.name)
                svc.interrupt(record)
            else:
                logger.info("session %s (%s) is gone", record.id, record.name)
                svc.forget(record.id)

        binaries = {rt.config.binary: rt.name for rt in svc.runtimes.values()}
        # Re-read before adopting: a session started meanwhile owns its pane already.
        known |= {(r.pane.socket, r.pane.pane_id) for r in svc.repo.list() if not r.interrupted_at}
        for pane in panes:
            if (pane.socket, pane.pane_id) in known:
                continue
            if pane.socket == svc.config.socket and pane.session_name.startswith(LAUNCHED_PREFIX):
                if self._restore(pane):
                    changed = True
                    continue
            runtime = binaries.get(pane.command)
            if runtime:
                logger.info("adopting %s pane %s in %s", runtime, pane.pane_id, pane.session_name)
                svc.repo.upsert(self._adopted_record(pane, runtime))
                changed = True
        return changed

    def _still_there(self, record: SessionRecord) -> bool:
        """Whether a session's pane, not listed, still runs when asked for directly: muxtower's own by the
        id it carries, one adopted by its server being the same one."""
        svc = self.service
        marks = svc.tmux.launch_marks(record.pane)
        if marks is None:
            return False
        if record.source == SessionSource.LAUNCHED:
            there = ours(marks) == record.id
        else:
            there = record.server_id is not None and svc.tmux.server_id(record.pane.socket) == record.server_id
        if there:
            logger.warning(
                "session %s (%s): its pane %s was not listed but still runs: kept", record.id, record.name,
                record.pane.pane_id,
            )  # fmt: skip
        return there

    def _restore(self, pane: PaneInfo) -> bool:
        """A pane muxtower started whose session is missing, or kept as interrupted while it runs on: its
        session again, under its own id."""
        svc = self.service
        seen = (pane.server or pane.socket, pane.pane_id, pane.pid)
        if time.monotonic() - self._not_ours.get(seen, -ASK_AGAIN_SECONDS) < ASK_AGAIN_SECONDS:
            return False
        marks = svc.tmux.launch_marks(PaneRef(pane.socket, pane.pane_id))
        session_id = ours(marks) if marks else None
        runtime = runtime_started(marks.start_command, svc.runtimes) if marks and session_id else None
        if marks is None or session_id is None or runtime is None:
            if marks is not None:
                self._not_ours[seen] = time.monotonic()
            return False
        record = svc.repo.get(session_id)
        if record is not None and not record.interrupted_at:
            # Its record has another pane, which is listed (else it would have been asked for): leave both.
            self._not_ours[seen] = time.monotonic()
            logger.warning("pane %s carries session %s, which runs in %s", pane.pane_id, session_id, record.pane)
            return False
        server = svc.tmux.server_id(pane.socket)
        if record is None:
            names = svc.names.offered(session_id, "") if svc.names else []
            created = datetime.fromtimestamp(marks.created, UTC) if marks.created else datetime.now(UTC)
            record = SessionRecord(
                id=session_id, name=names[0].name if names else display_name(pane), runtime=runtime.name,
                cwd=pane.cwd, source=SessionSource.LAUNCHED, pane=PaneRef(pane.socket, pane.pane_id),
                tmux_session=pane.session_name, hook_token_hash=None, auto_approve=False, created_at=created,
            )  # fmt: skip
        record.pane, record.tmux_session = PaneRef(pane.socket, pane.pane_id), pane.session_name
        record.server_id, record.interrupted_at = server, None
        logger.warning(
            "session %s (%s): its pane %s still runs, but its session was missing or interrupted: restored",
            session_id, record.name, pane.pane_id,
        )  # fmt: skip
        svc.restore(record, runtime, marks.env.get(TOKEN_ENV), MCP_TOKEN_ENV in marks.env)
        return True
