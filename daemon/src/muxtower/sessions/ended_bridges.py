"""The Remote Control session of a muxtower session follows it: once the agent has ended (stopped, archived,
gone), its bridge is archived too, its conversation kept to read under Archived, instead of staying listed
on its own (Remote Control keeps listing a CLI conversation after its process is gone, with no
environment: "No environment", history but no CLI).

A bridge is known as a session's by `session_remote_ids` (what the monitor and the list saw; kept when the
session is stopped), or else by the process file Claude Code left for it, which names muxtower's tmux
session (`mxt-<id's first 8>`, `ClaudeProcesses.ended_bridges`): here, and on each node (asked, as only it
has its files). Only a bridge that runs nowhere (no environment) is archived."""

import asyncio
import logging
from collections.abc import Callable

from muxtower.sessions.archiving import Archiver
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.models import Session
from muxtower.sessions.ports import SessionSource

logger = logging.getLogger("muxtower.sessions")

EVERY_SECONDS = 60.0

SEPARATOR = "~"  # a node's session as the hub lists it: <node>~<its id there>


def ended(
    listed: list[Session],
    owners: dict[str, str],
    here: dict[str, str],
    nodes: dict[str, dict[str, str]],
    online: set[str] | None = None,
) -> list[str]:
    """The Remote Control sessions listed on their own whose muxtower session has ended: by `owners` (bridge
    → session), else by the process files left here (`here`: bridge → id prefix) or on a node (`nodes`, those
    online). A node's session is judged only while its node is online (`online`; None: all are), its list
    then current."""
    live = [s for s in listed if not s.archived_at]
    live_ids = {s.id for s in live}
    local_prefixes = {s.id[:8] for s in live if SEPARATOR not in s.id}
    node_prefixes: dict[str, set[str]] = {}
    for s in live:
        if SEPARATOR in s.id:
            node, local = s.id.split(SEPARATOR, 1)
            node_prefixes.setdefault(node, set()).add(local[:8])
    found = []
    for s in live:
        if s.source != SessionSource.REMOTE_CONTROL or not (s.machine is None or s.offline):
            continue  # not a bridge on its own, or one still running somewhere (offline: where it last ran)
        owner = owners.get(s.id)
        if owner is not None:
            on = owner.split(SEPARATOR, 1)[0] if SEPARATOR in owner else None  # its node, if it runs on one
            judged = on is None or online is None or on in online
            if judged and owner not in live_ids:
                found.append(s.id)
            continue
        if (prefix := here.get(s.id)) is not None and prefix not in local_prefixes:
            found.append(s.id)
            continue
        for node, bridges in nodes.items():
            if (prefix := bridges.get(s.id)) is not None and prefix not in node_prefixes.get(node, set()):
                found.append(s.id)
                break
    return found


class EndedBridges:
    def __init__(
        self, directory: SessionDirectory, archiver: Archiver, here: Callable[[], dict[str, str]],
        nodes: Callable[[], dict[str, dict[str, str]]] = dict, online: Callable[[], set[str]] = set,
    ) -> None:  # fmt: skip
        self.directory, self.archiver, self.here, self.nodes, self.online = directory, archiver, here, nodes, online

    def tick(self) -> list[str]:
        """Blocking. Archives the bridges of ended sessions; returns their ids."""
        listed = self.directory.list()
        owners = self.directory.local.repo.remote_ids()
        rc = SessionSource.REMOTE_CONTROL
        if not any(s.source == rc and (s.machine is None or s.offline) for s in listed):
            return []
        gone = ended(listed, owners, self.here(), self.nodes(), self.online())
        for remote_id in gone:
            try:
                self.archiver.archive(remote_id)
                owner = owners.get(remote_id, "a muxtower session")
                logger.info("archived %s: the Remote Control session of %s, which has ended", remote_id, owner)
            except Exception as exc:  # noqa: BLE001 - tried again on the next tick
                logger.warning("could not archive %s, whose session has ended: %s", remote_id, exc)
        return gone

    async def run_loop(self) -> None:
        while True:
            await asyncio.sleep(EVERY_SECONDS)  # first after a minute: the lists and the nodes in by then
            try:
                await asyncio.to_thread(self.tick)
            except Exception:
                logger.exception("archiving ended sessions' bridges failed")
