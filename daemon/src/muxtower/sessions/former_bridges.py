"""Remote Control sessions a live muxtower session's conversation ran before, found by the conversation
itself: folded into that session (`session_remote_ids`), never listed on their own.

The monitor notes a pane's former bridges while Claude Code's process files still name them
(`ClaudeProcesses.former_remote_ids`); a bridge from before that was kept, or whose file was tidied away,
stays on its own ("No environment", no project). Its conversation still names it: a Remote Control session's
first message (`Lineage.first`) is its transcript's first message, under the same id. A bridge on its own
whose first message starts a live session's transcript, or one that went on into it (`continued-in`), is
that session's (`ClaudeProcesses.carries`). Forks are left out on both sides (a fork starts with its
parent's first message): a tagged fork or side chat has no `first` here (`firsts`), a fork made in Claude
desktop is titled "… (fork)", and a muxtower session that is a fork (`fork_of`) takes no bridge this way."""

import asyncio
import logging
from collections.abc import Callable

from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.models import Session
from muxtower.sessions.ports import SessionSource
from muxtower.sources.remote_control.lineage import FORK_SUFFIX

logger = logging.getLogger("muxtower.sessions")

EVERY_SECONDS = 60.0


def on_their_own(listed: list[Session], owners: dict[str, str]) -> list[Session]:
    """Remote Control sessions listed on their own that run nowhere (no environment, or offline), are no
    known session's, and are no fork."""
    return [
        s for s in listed
        if s.source == SessionSource.REMOTE_CONTROL and (s.machine is None or s.offline) and not s.archived_at
        and s.id not in owners and not s.fork_of and not s.name.rstrip().endswith(FORK_SUFFIX)
    ]  # fmt: skip


def owners_of(
    orphans: list[Session],
    firsts: dict[str, str],
    transcripts: dict[str, str],
    carries: Callable[[str, str], bool],
) -> dict[str, str]:
    """Each orphan bridge (`on_their_own`) to the live session whose conversation it carried: the one
    session whose transcript `carries` its first message (two: neither, it cannot be told)."""
    found: dict[str, str] = {}
    for bridge in orphans:
        first = firsts.get(bridge.id)
        if not first:
            continue
        owners = [sid for sid, path in transcripts.items() if carries(path, first)]
        if len(owners) == 1:
            found[bridge.id] = owners[0]
    return found


class FormerBridges:
    def __init__(
        self, directory: SessionDirectory, firsts: Callable[[], dict[str, str]], carries: Callable[[str, str], bool],
        changed: Callable[[], None] = lambda: None,
    ) -> None:  # fmt: skip
        self.directory, self.firsts, self.carries, self.changed = directory, firsts, carries, changed

    def tick(self) -> dict[str, str]:
        """Blocking (files). Folds the orphan bridges whose conversation a live session runs; returns them."""
        listed = self.directory.list()
        repo = self.directory.local.repo
        orphans = on_their_own(listed, repo.remote_ids())
        if not orphans:
            return {}
        forks = {s.id for s in listed if s.fork_of}
        transcripts = {sid: p for sid, p in self.directory.transcript_paths().items() if sid not in forks}
        found = owners_of(orphans, self.firsts(), transcripts, self.carries)
        for bridge, owner in found.items():
            repo.note_remote_ids(owner, [bridge])
            logger.info("folded %s into %s: an earlier Remote Control session of its conversation", bridge, owner)
        if found:
            self.changed()  # the lists show it folded
        return found

    async def run_loop(self) -> None:
        while True:
            await asyncio.sleep(EVERY_SECONDS)  # first after a minute: the lists in by then
            try:
                await asyncio.to_thread(self.tick)
            except Exception:
                logger.exception("folding earlier Remote Control sessions failed")
