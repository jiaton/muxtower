"""Every session's project worked out once, as soon as it is listed (not only when a team tool asks), so
the app's lists and `my_team` say the same from the start (`TeamService.member` keeps what it found)."""

import asyncio
import logging
from typing import Any

from muxtower.infra.bus import EventBus
from muxtower.teams.service import TeamService

logger = logging.getLogger("muxtower.teams")

SETTLE_SECONDS = 2.0  # a burst of list changes is one look


def place_new(teams: TeamService) -> int:
    """Blocking (git, cached). Works out the project of each listed session that has none kept yet."""
    placed = 0
    for session in teams.directory.list():
        if session.archived_at or session.interrupted_at:
            continue
        kept = teams.kept(session.id)
        if kept is None or kept.project is None:
            teams.member(session)
            placed += 1
    return placed


async def run_loop(teams: TeamService, bus: EventBus) -> None:
    queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
    bus.subscribe("sessions", queue)
    while True:
        try:
            await asyncio.to_thread(place_new, teams)
        except Exception:
            logger.exception("could not work out the sessions' projects")
        await queue.get()
        await asyncio.sleep(SETTLE_SECONDS)
        while not queue.empty():
            queue.get_nowait()
