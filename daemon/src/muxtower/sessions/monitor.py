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
from muxtower.sessions.live import ScreenState
from muxtower.sessions.ports import ClaudeProcessPort, SessionRecord, SessionSource
from muxtower.sessions.service import SessionService
from muxtower.terminal.ports import PaneInfo, PaneRef

logger = logging.getLogger("muxtower.monitor")

WAKE_SETTLE = 0.04  # seconds: keys typed in a row arrive within this, and are captured together
MIN_GAP = 0.1  # seconds between ticks, however often hooks or input wake the loop


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


def newest(*paths: str | None) -> str | None:
    """The transcript written to last, of those that exist: the one its hooks name (where Claude Code
    writes now) and the one its process file names, which can be left behind."""
    found = []
    for path in filter(None, paths):
        try:
            found.append((os.path.getmtime(path), path))
        except OSError:
            continue
    return max(found)[1] if found else None


class Monitor:
    def __init__(self, service: SessionService, processes: ClaudeProcessPort | None = None) -> None:
        self.service = service
        self.processes = processes
        self._panes: dict[tuple[str, str], PaneInfo] = {}  # (socket, pane id) -> as last listed
        self._viewers: dict[str, list[int]] = defaultdict(list)  # session id -> history lines wanted
        self._loop: asyncio.AbstractEventLoop | None = None
        self._woken: asyncio.Event | None = None

    def wake(self) -> None:
        """From any thread: look again soon instead of at the next interval (input was just sent, a hook
        said the state changed), so what was typed shows at once."""
        if self._loop is not None and self._woken is not None:
            self._loop.call_soon_threadsafe(self._woken.set)

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

        known: set[tuple[str, str]] = set()
        for record in records:
            key = (record.pane.socket, record.pane.pane_id)
            if key not in alive:
                logger.info("session %s (%s) is gone", record.id, record.name)
                svc.forget(record.id)
                changed = True
            else:
                known.add(key)

        binaries = {rt.config.binary: rt.name for rt in svc.runtimes.values()}
        # Re-read before adopting: a session started meanwhile owns its pane already.
        known |= {(r.pane.socket, r.pane.pane_id) for r in svc.repo.list()}
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
            live = svc.live_of(record.id)
            first_sight = live.screen is None
            before = svc.effective(record)
            pane = self._panes.get((record.pane.socket, record.pane.pane_id))

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
            pid = pane.pid if pane else 0
            remote_id = self.processes.remote_id(pid, text) if self.processes and pid else None
            named = self.processes.transcript(pid, text) if self.processes and pid else None
            transcript = newest(live.hook_transcript, named)
            if transcript != live.transcript and named and transcript != named:
                logger.info("session %s: following %s, written to since %s", record.id, transcript, named)
            title = self.processes.name(pid, text) if self.processes and pid else None
            alt_screen, attached = bool(pane and pane.alternate), bool(pane and pane.attached)
            seen = (remote_id, transcript, title, alt_screen, attached)
            if seen != (live.remote_id, live.transcript, live.title, live.alt_screen, live.attached):
                live.remote_id, live.transcript, live.title, live.alt_screen, live.attached = seen
                result.sessions_changed = True

            entered = svc.refresh(record, live, before.state)
            if first_sight and live.hook is None and pane and pane.activity:
                # Without hooks, the window's last output is the best guess at when it was last active
                # (after refresh, which stamps a first state as changed now).
                live.updated_at = datetime.fromtimestamp(pane.activity, UTC)
            after = live.effective
            if after != before:
                result.sessions_changed = True
            if entered:
                result.attention.append(record.id)
        return result

    async def run_loop(self, bus: EventBus, interval: float) -> None:
        """A tick every `interval`, or soon after `wake`: keys typed in a row are taken together (after
        WAKE_SETTLE), and ticks stay MIN_GAP apart however often something wakes it."""
        logger.info("monitor loop started (every %ss)", interval)
        self._loop, self._woken = asyncio.get_running_loop(), asyncio.Event()
        while True:
            self._woken.clear()  # a wake during this tick asks for another
            started = time.monotonic()
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
            try:
                await asyncio.wait_for(self._woken.wait(), max(0.0, interval - (time.monotonic() - started)))
            except TimeoutError:
                continue
            await asyncio.sleep(max(WAKE_SETTLE, MIN_GAP - (time.monotonic() - started)))
