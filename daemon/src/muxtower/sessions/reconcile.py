"""The registry made to match tmux, every tick: a session whose pane is gone is forgotten (it ended) or kept
as interrupted (its tmux server restarted under it: `interrupted.py`), and an agent found running in a
pane nobody owns is adopted. Mixed into `Monitor`, which holds what it keeps between ticks."""

import hashlib
import logging
import os
from datetime import UTC, datetime

from muxtower.sessions.interrupted import gone
from muxtower.sessions.ports import SessionRecord, SessionSource
from muxtower.sessions.service import SessionService
from muxtower.terminal.ports import PaneInfo, PaneRef

logger = logging.getLogger("muxtower.monitor")


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
            runtime = binaries.get(pane.command)
            if runtime and (pane.socket, pane.pane_id) not in known:
                logger.info("adopting %s pane %s in %s", runtime, pane.pane_id, pane.session_name)
                svc.repo.upsert(self._adopted_record(pane, runtime))
                changed = True
        return changed
