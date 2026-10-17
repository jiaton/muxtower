"""The one capture loop. Every tick it reconciles the registry with tmux (drops sessions whose pane is
gone, adopts agents found running elsewhere), captures each pane once, classifies it, and reports what
changed. Every consumer (API, stream, push, auto-approve) reads the results instead of calling tmux."""

import asyncio
import hashlib
import logging
import os
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime

from muxtower.infra.bus import EventBus
from muxtower.runtimes.models import AgentState
from muxtower.runtimes.spec import Classification
from muxtower.sessions.live import LiveSession, ScreenState
from muxtower.sessions.ports import SessionRecord, SessionSource
from muxtower.sessions.service import SessionService
from muxtower.terminal.ports import PaneInfo, PaneRef

logger = logging.getLogger("muxtower.monitor")


@dataclass
class TickResult:
    sessions_changed: bool = False
    screens: dict[str, str] = field(default_factory=dict)  # session id -> new ansi screen
    attention: list[str] = field(default_factory=list)  # session ids that entered an attention state


def display_name(pane: PaneInfo) -> str:
    """tmux names unnamed sessions 0, 1, 2…; the working directory says more than that."""
    if pane.session_name.isdigit():
        return os.path.basename(pane.cwd.rstrip("/")) or pane.cwd or f"tmux {pane.session_name}"
    return pane.session_name


class Monitor:
    def __init__(self, service: SessionService) -> None:
        self.service = service
        self._viewers: dict[str, list[int]] = defaultdict(list)  # session id -> history lines wanted

    # Viewers (open terminal views) make the loop also capture colors + scrollback for that session.
    def add_viewer(self, session_id: str, history: int) -> None:
        self._viewers[session_id].append(history)

    def remove_viewer(self, session_id: str, history: int) -> None:
        wanted = self._viewers.get(session_id)
        if wanted and history in wanted:
            wanted.remove(history)
        if not wanted:
            self._viewers.pop(session_id, None)

    def screen(self, session_id: str) -> ScreenState | None:
        live = self.service.live.get(session_id)
        return live.screen if live else None

    # --- reconcile -----------------------------------------------------------------------------

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

    def reconcile(self) -> bool:
        svc = self.service
        sockets = dict.fromkeys([svc.config.socket, *svc.config.adopt_sockets])
        panes = [p for socket in sockets for p in svc.tmux.list_panes(socket)]
        alive = {(p.socket, p.pane_id) for p in panes}
        changed = False

        known: set[tuple[str, str]] = set()
        for record in svc.repo.list():
            key = (record.pane.socket, record.pane.pane_id)
            if key not in alive:
                logger.info("session %s (%s) is gone", record.id, record.name)
                svc.forget(record.id)
                changed = True
            else:
                known.add(key)

        binaries = {rt.config.binary: rt.name for rt in svc.runtimes.values()}
        for pane in panes:
            runtime = binaries.get(pane.command)
            if runtime and (pane.socket, pane.pane_id) not in known:
                logger.info("adopting %s pane %s in %s", runtime, pane.pane_id, pane.session_name)
                svc.repo.upsert(self._adopted_record(pane, runtime))
                changed = True
        return changed

    # --- capture -------------------------------------------------------------------------------

    def tick(self) -> TickResult:
        """Blocking: runs tmux. Called from a worker thread by run_loop."""
        svc = self.service
        result = TickResult(sessions_changed=self.reconcile())
        now = time.monotonic()
        for record in svc.repo.list():
            text = svc.tmux.capture(record.pane)
            if text is None:
                continue  # gone; the next reconcile drops it
            live = svc.live.setdefault(record.id, LiveSession())
            before = svc.effective(record)

            runtime = svc.runtime_of(record)
            classification = runtime.classify(text) if runtime else Classification(AgentState.UNKNOWN, None)
            previous = live.screen
            since = previous.since if previous and previous.classification.state == classification.state else now
            ansi = None
            wanted = self._viewers.get(record.id)
            if wanted:
                ansi = svc.tmux.capture(record.pane, ansi=True, history=max(wanted))
                if ansi is not None and (previous is None or previous.ansi != ansi):
                    result.screens[record.id] = ansi
            live.screen = ScreenState(classification, text, since, ansi)

            entered = svc.refresh(record, live, before.state)
            after = live.effective
            if after != before:
                result.sessions_changed = True
            if entered:
                result.attention.append(record.id)
        return result

    async def run_loop(self, bus: EventBus, interval: float) -> None:
        logger.info("monitor loop started (every %ss)", interval)
        while True:
            try:
                result = await asyncio.wait_for(asyncio.to_thread(self.tick), timeout=30)
            except TimeoutError:
                logger.warning("monitor tick timed out")
            except Exception:
                logger.exception("monitor tick failed")
            else:
                if result.sessions_changed:
                    bus.publish("sessions", None)
                for session_id, ansi in result.screens.items():
                    bus.publish(f"screen:{session_id}", ansi)
                for session_id in result.attention:
                    bus.publish(f"attention:{session_id}", None)
            await asyncio.sleep(interval)
