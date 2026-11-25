"""The hub's Inbox loop: it sleeps until the next due date (or an hour at most: the weekly nudge, a changed
due hour or time zone), and wakes early on any change of an item. The event loop only times it: every read,
write and send runs in a thread (`firing.py`). On start it acts first, so what fell due while the daemon was
down goes out at once. A node runs none: the hub keeps the Inbox."""

import asyncio
import logging
from collections.abc import Callable
from datetime import UTC, datetime

from muxtower.inbox.firing import InboxWork

logger = logging.getLogger("muxtower.inbox")

MAX_SLEEP = 3600.0


class InboxSchedule:
    def __init__(self, work: InboxWork, is_hub: Callable[[], bool]) -> None:
        self.work = work
        self.is_hub = is_hub
        self._loop: asyncio.AbstractEventLoop | None = None
        self._wake: asyncio.Event | None = None

    def wake(self) -> None:
        """From any thread: look again now (an item changed)."""
        if self._loop is not None and self._wake is not None:
            self._loop.call_soon_threadsafe(self._wake.set)

    def _round(self) -> datetime | None:
        """Blocking: due dates acted on, the nudge; when the next due date falls."""
        try:
            self.work.fire_due()
        except Exception:
            logger.exception("could not act on Inbox due dates")
        try:
            self.work.nudge()
        except Exception:
            logger.exception("could not send the weekly Inbox nudge")
        return self.work.next_due()

    async def run_loop(self) -> None:
        self._loop, self._wake = asyncio.get_running_loop(), asyncio.Event()
        while True:
            self._wake.clear()
            following = await asyncio.to_thread(self._round) if self.is_hub() else None
            delay = MAX_SLEEP
            if following is not None:
                delay = min(MAX_SLEEP, max(0.0, (following - datetime.now(UTC)).total_seconds()))
            try:
                await asyncio.wait_for(self._wake.wait(), delay)
            except TimeoutError:
                pass
