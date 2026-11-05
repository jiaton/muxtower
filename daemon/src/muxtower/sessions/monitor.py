"""The one capture loop. Every tick it reconciles the registry with tmux (drops sessions whose pane is
gone, adopts agents found running elsewhere), captures each pane once, classifies it, and reports what
changed. Every consumer (API, stream, push, auto-approve) reads the results instead of calling tmux."""

import asyncio
import logging
import os
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import UTC, datetime

from muxtower.infra.bus import EventBus
from muxtower.runtimes.models import AgentState
from muxtower.runtimes.spec import Classification
from muxtower.sessions.live import ScreenState
from muxtower.sessions.names import CLAUDE, SET_IN_CLAUDE
from muxtower.sessions.naming import seen as seen_name
from muxtower.sessions.ports import ClaudeProcessPort
from muxtower.sessions.reconcile import Reconciler
from muxtower.sessions.service import SessionService
from muxtower.terminal.patches import ScreenFeed
from muxtower.terminal.ports import PaneInfo

logger = logging.getLogger("muxtower.monitor")

WAKE_SETTLE = 0.04  # seconds: keys typed in a row arrive within this, and are captured together
MIN_GAP = 0.1  # seconds between ticks, however often hooks or input wake the loop
TIMINGS_KEPT = 120  # ticks whose timing is kept (a couple of minutes)
REREAD_SECONDS = 5.0  # a pane with no output since is still read this often


@dataclass
class TickResult:
    sessions_changed: bool = False
    screens: dict[str, str] = field(default_factory=dict)  # session id -> new ansi screen
    attention: list[str] = field(default_factory=list)  # session ids that entered an attention state


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


@dataclass(frozen=True)
class TickTiming:
    """One tick: how long it took, and the screen rule that took longest (session, rule, seconds)."""

    at: float  # monotonic
    seconds: float
    slowest: tuple[str, str, float] | None


class Monitor(Reconciler):
    def __init__(self, service: SessionService, processes: ClaudeProcessPort | None = None) -> None:
        self.service = service
        self.processes = processes
        self._panes: dict[tuple[str, str], PaneInfo] = {}  # (socket, pane id) -> as last listed
        self._viewers: dict[str, list[int]] = defaultdict(list)  # session id -> history lines wanted
        self.timings: deque[TickTiming] = deque(maxlen=TIMINGS_KEPT)  # the latest ticks, for `usage/`
        self._captured: dict[str, tuple[float, float]] = {}  # session id -> when last read (wall, monotonic)
        self._seen_servers: dict[str, str] = {}  # socket -> the tmux server seen alive there this run
        self._loop: asyncio.AbstractEventLoop | None = None
        self._woken: asyncio.Event | None = None
        self.screen_feed = ScreenFeed()  # shared with the hub's node screens (app.py)

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

    # --- capture -------------------------------------------------------------------------------

    def _unchanged(self, session_id: str, pane: PaneInfo | None, now: float) -> bool:
        """Nothing to read again: tmux says its window had no output since before the last capture (it counts
        whole seconds, so output in that same second is read), nobody watches it, and it was read lately."""
        captured = self._captured.get(session_id)
        if captured is None or pane is None or not pane.activity or session_id in self._viewers:
            return False
        wall, at = captured
        return pane.activity < int(wall) and now - at < REREAD_SECONDS

    def tick(self) -> TickResult:
        """Blocking: runs tmux. Called from a worker thread by run_loop."""
        svc = self.service
        started = time.perf_counter()
        slowest: tuple[str, str, float] | None = None
        result = TickResult(sessions_changed=self.reconcile())
        now = time.monotonic()
        wall = time.time()
        for record in svc.repo.list():
            if record.interrupted_at:
                continue
            pane = self._panes.get((record.pane.socket, record.pane.pane_id))
            if self._unchanged(record.id, pane, now):
                continue
            text = svc.tmux.capture(record.pane)
            if text is None:
                continue  # gone; the next reconcile drops it
            self._captured[record.id] = (wall, now)
            live = svc.live_of(record.id)
            first_sight = live.screen is None
            before = svc.effective(record)

            runtime = svc.runtime_of(record)
            classification = runtime.classify(text) if runtime else Classification(AgentState.UNKNOWN, None)
            if classification.slowest and (slowest is None or classification.slowest[1] > slowest[2]):
                slowest = (record.id, classification.slowest[0], classification.slowest[1])
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
            ask = getattr(self.processes, "name_origin", None)  # Claude Code's says where its name came from
            origin = ask(pid, text) if ask and pid and title else None
            if origin != live.title_origin:
                live.title_origin = origin
                result.sessions_changed = True
            if title and svc.names and title != live.title:
                svc.names.note(record.id, title, SET_IN_CLAUDE if origin and origin.source == "user" else CLAUDE)
            if seen_name(record, title, origin, datetime.now(UTC)):  # a new name set there, not a restored one
                svc.repo.upsert(record)
                result.sessions_changed = True
            alt_screen, attached = bool(pane and pane.alternate), bool(pane and pane.attached)
            if transcript:
                svc.know_agent(record, transcript)
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
        self.timings.append(TickTiming(now, time.perf_counter() - started, slowest))
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
                    self.screen_feed.publish(bus, session_id, ansi)  # numbered, with its patch (`patches.py`)
                for session_id in result.attention:
                    bus.publish(f"attention:{session_id}", None)
            try:
                await asyncio.wait_for(self._woken.wait(), max(0.0, interval - (time.monotonic() - started)))
            except TimeoutError:
                continue
            await asyncio.sleep(max(WAKE_SETTLE, MIN_GAP - (time.monotonic() - started)))
