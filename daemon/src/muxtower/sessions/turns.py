"""When a session finished a turn: it worked for a while and has stayed idle since.

Every source says "busy" and "idle" in its own way (hooks, Remote Control's worker status, a screen
read), and a screen read can flicker, so a turn counts as finished only once the session has been idle
for a few seconds after working for a few seconds. A session that stops to ask is not finished: the
attention alert covers it, and the turn starts again when it goes on. Sessions seen for the first time
(at startup) are only learned, never announced.
"""

import asyncio
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from muxtower.infra.bus import EventBus
from muxtower.runtimes.models import AgentState
from muxtower.sessions.models import Session

logger = logging.getLogger("muxtower.turns")

MIN_BUSY_SECONDS = 5.0
SETTLE_SECONDS = 6.0
CHECK_SECONDS = 2.0


@dataclass
class _Track:
    busy_since: float | None = None
    idle_since: float | None = None


class TurnWatcher:
    def __init__(self) -> None:
        self._tracks: dict[str, _Track] = {}

    def observe(self, sessions: list[Session], now: float) -> list[str]:
        """The ids of sessions that finished a turn since the last call."""
        finished: list[str] = []
        for session in sessions:
            track = self._tracks.get(session.id)
            if track is None:
                self._tracks[session.id] = _Track(busy_since=now if session.state == AgentState.BUSY else None)
            elif session.state == AgentState.BUSY:
                track.busy_since = track.busy_since or now
                track.idle_since = None
            elif session.needs_attention:
                track.busy_since = track.idle_since = None
            elif session.state == AgentState.IDLE and track.busy_since is not None:
                track.idle_since = track.idle_since or now
                if now - track.idle_since < SETTLE_SECONDS:
                    continue
                if track.idle_since - track.busy_since >= MIN_BUSY_SECONDS:
                    finished.append(session.id)
                track.busy_since = track.idle_since = None
        for gone in set(self._tracks) - {s.id for s in sessions}:
            del self._tracks[gone]
        return finished

    async def run_loop(self, bus: EventBus, sessions: Callable[[], list[Session]]) -> None:
        """Publishes "done:<id>" for every finished turn; looks again on every change and every few
        seconds (settling needs time to pass without one)."""
        queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        bus.subscribe("sessions", queue)
        while True:
            try:
                for session_id in self.observe(await asyncio.to_thread(sessions), time.monotonic()):
                    logger.info("session %s finished a turn", session_id)
                    bus.publish(f"done:{session_id}", None)
            except Exception:
                logger.exception("turn check failed")
            try:
                await asyncio.wait_for(queue.get(), timeout=CHECK_SECONDS)
            except TimeoutError:
                pass
            while not queue.empty():
                queue.get_nowait()
