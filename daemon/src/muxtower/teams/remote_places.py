"""The project of a session whose folder is on another machine: a Remote Control session with no process
here (the Claude app, claude.ai) cannot be read from git on the hub, so the machine it runs on is asked.

- On the hub's own machine: git here, as for any session (`checkout.py`).
- On a linked node: the node is asked (`place`), and answers from git there with the same logic it uses for
  its own sessions: {project, source}, or none when the folder is in no repository.
- Anywhere else (a machine that is no node, an offline node, one too old to know `place`, no folder): no
  project; the app groups it by its folder, as before.

Asked off every listing, on the event loop: a listing never waits on a link. Answers are kept per (machine,
folder): a real answer for good; no answer (offline, too old, no reply) is asked again when that node links
again, else not more often than every RETRY_SECONDS. What is found is kept as the session's worked-out
project (`TeamService.place`), so a project set by an agent or the owner always wins."""

import asyncio
import logging
import os
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from muxtower.infra.bus import EventBus
from muxtower.nodes.hub import Nodes
from muxtower.sessions.models import Session
from muxtower.teams.service import TeamService

logger = logging.getLogger("muxtower.teams")

ASK_SECONDS = 10.0
RETRY_SECONDS = 300.0
SETTLE_SECONDS = 2.0
HERE = ""  # the machine of the hub itself, in the cache's keys


@dataclass(frozen=True)
class Place:
    project: str
    source: str  # git remote | git root


Key = tuple[str, str]  # (node name, or HERE; folder)


def _place(raw: Any) -> Place | None:
    if not isinstance(raw, dict):
        return None
    project, source = raw.get("project"), raw.get("source")
    if isinstance(project, str) and project and source in ("git remote", "git root"):
        return Place(project, str(source))
    return None


class RemotePlaces:
    def __init__(self, teams: TeamService, nodes: Nodes, clock: Callable[[], float] = time.monotonic) -> None:
        self.teams = teams
        self.nodes = nodes
        self.clock = clock
        self._known: dict[Key, Place | None] = {}  # answered: its project, or None (in no repository)
        self._missed: dict[Key, float] = {}  # not answered: when it was last asked
        self.asked = 0  # asks sent to nodes (how often a node is bothered)
        nodes.linked.append(self.relinked)

    def relinked(self, name: str) -> None:
        """A node connected: what it did not answer is asked again at once."""
        for key in [k for k in self._missed if k[0] == name]:
            del self._missed[key]

    def _where(self, session: Session) -> Key | None:
        """Pure. Where a session's project would be read, when it needs one read off this machine."""
        if session.node is not None or session.on_host or session.archived_at or session.interrupted_at:
            return None
        if not session.cwd or not session.machine:
            return None
        kept = self.teams.kept(session.id)
        if kept is not None and kept.project is not None:
            return None
        machine = session.machine.lower()
        if machine == (self.teams.directory.hub_name or "").lower():
            return (HERE, session.cwd)
        node = next((name for name in self.nodes.all() if name.lower() == machine), None)
        return (node, session.cwd) if node else None

    def wanted(self) -> dict[str, Key]:
        """Blocking (the listing). Each session that needs its project read on another machine, and where."""
        return {s.id: key for s in self.teams.directory.list() if (key := self._where(s)) is not None}

    async def _ask(self, key: Key) -> None:
        name, cwd = key
        if name == HERE:
            found = await asyncio.to_thread(self.teams.checkouts.get, os.path.expanduser(cwd))
            self._known[key] = Place(found.project, found.source) if found.source != "folder" else None
            return
        node = self.nodes.all().get(name)
        if node is None or not node.online or node.link is None:
            self._missed[key] = self.clock()
            return
        self.asked += 1
        try:
            answer = await node.link.call("place", {"cwd": cwd}, ASK_SECONDS)
        except Exception as exc:  # noqa: BLE001 - offline a moment, slow, or too old to know `place`
            logger.info("%s did not say which project a folder is in: %s", name, exc)
            self._missed[key] = self.clock()
            return
        self._missed.pop(key, None)
        self._known[key] = _place(answer)

    async def run_once(self, wanted: dict[str, Key] | None = None) -> int:
        """Asks what is not known yet (each place once, at the same time) and keeps what is found; returns how
        many sessions got a project."""
        if wanted is None:
            wanted = await asyncio.to_thread(self.wanted)
        now = self.clock()
        due = {
            key for key in wanted.values()
            if key not in self._known and now - self._missed.get(key, -RETRY_SECONDS) >= RETRY_SECONDS
        }  # fmt: skip
        asks: list[Awaitable[None]] = [self._ask(key) for key in due]
        await asyncio.gather(*asks)
        placed = 0
        for session_id, key in wanted.items():
            if (place := self._known.get(key)) is not None:
                placed += await asyncio.to_thread(self.teams.place, session_id, place.project, place.source)
        return placed

    async def run_loop(self, bus: EventBus) -> None:
        queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        bus.subscribe("sessions", queue)
        while True:
            try:
                await self.run_once()
            except Exception:
                logger.exception("could not work out the projects of sessions on other machines")
            await queue.get()
            await asyncio.sleep(SETTLE_SECONDS)
            while not queue.empty():
                queue.get_nowait()
