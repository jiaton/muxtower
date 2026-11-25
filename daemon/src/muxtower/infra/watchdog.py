"""Says when the event loop is blocked, and by what: the loop beats a heartbeat; a thread of its own looks at it,
and when the beat is late by more than `threshold` seconds logs the loop thread's stack (what it is stuck in) and
what every other thread is running (one of them may hold the GIL or a lock the loop waits for). Once the loop
runs again it logs how long it was blocked.

Everything the loop does must be quick (blocking calls run in `asyncio.to_thread`): a loop blocked for a
second stops every HTTP answer, every stream and every node's link (their keepalive pings go unanswered)."""

import asyncio
import logging
import sys
import threading
import time
import traceback

logger = logging.getLogger("muxtower.watchdog")

THRESHOLD_SECONDS = 1.0
BEAT_SECONDS = 0.25
STACK_FRAMES = 25


def _other_threads(loop_thread: int) -> list[str]:
    names = {t.ident: t.name for t in threading.enumerate()}
    lines = []
    for ident, frame in sys._current_frames().items():  # noqa: SLF001 - the one way to read another thread's stack
        if ident in (loop_thread, threading.get_ident()):
            continue
        where = traceback.extract_stack(frame, limit=1)
        at = f"{where[-1].filename}:{where[-1].lineno} {where[-1].name}" if where else "?"
        lines.append(f"  {names.get(ident, ident)}: {at}")
    return lines


class LoopWatchdog:
    def __init__(self, threshold: float = THRESHOLD_SECONDS, beat: float = BEAT_SECONDS) -> None:
        self.threshold = threshold
        self.beat = beat
        self.stalls = 0  # blocked spells seen (tests)
        self._last = time.monotonic()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._loop_thread = 0
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        """From the loop's own thread."""
        self._loop, self._loop_thread = loop, threading.get_ident()
        self._last = time.monotonic()
        self._stop.clear()
        loop.call_soon(self._beat)
        self._thread = threading.Thread(target=self._watch, name="loop-watchdog", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(2)

    def _beat(self) -> None:
        self._last = time.monotonic()
        if not self._stop.is_set() and self._loop is not None:
            self._loop.call_later(self.beat, self._beat)

    def _watch(self) -> None:
        blocked_since: float | None = None
        while not self._stop.wait(self.beat):
            last = self._last
            late = time.monotonic() - last
            if blocked_since is None and late > self.threshold:
                blocked_since = last
                self.stalls += 1
                self._report(late)
            elif blocked_since is not None and last > blocked_since:
                logger.warning("event loop ran again after %.1f s blocked", last - blocked_since)
                blocked_since = None

    def _report(self, late: float) -> None:
        frame = sys._current_frames().get(self._loop_thread)  # noqa: SLF001
        stack = "".join(traceback.format_stack(frame, limit=STACK_FRAMES)) if frame else "  (no stack)\n"
        others = "\n".join(_other_threads(self._loop_thread)) or "  (none)"
        logger.warning(
            "event loop blocked for %.1f s; it is running:\n%sother threads:\n%s", late, stack, others
        )  # fmt: skip
