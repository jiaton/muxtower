"""Who writes in which worktree, so two sessions changing one checkout at once see each other (one's commit
could take the other's unfinished change along). Only a hint: nothing is locked or held back, and a miss
is better than a false alarm, so it is counted narrowly:

- only what a file-editing tool reports writing (Claude Code: Edit, Write, MultiEdit, NotebookEdit;
  Codex: apply_patch), never a Bash command (read or write, it cannot be told: a known blind spot);
- each path resolved (symlinks too) and put in the git worktree it is in (`git rev-parse --show-toplevel`):
  worktrees of one repository are apart, as they should be; a file outside git is left out;
- only this machine's sessions (hooks come only from them), only writes within `window_minutes`, only
  sessions still listed and running (not archived, interrupted or ended).

Kept in memory: after a restart it starts again from nothing."""

import os
import re
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from muxtower.teams.checkout import CheckoutCache

EDITING_TOOLS = {"Edit": "file_path", "Write": "file_path", "MultiEdit": "file_path", "NotebookEdit": "notebook_path"}
PATCH_TOOLS = {"apply_patch"}
PATCH_FILE = re.compile(r"^\*\*\* (?:Add|Update|Delete) File: (.+)$", re.MULTILINE)
PATCH_MOVE = re.compile(r"^\*\*\* Move to: (.+)$", re.MULTILINE)


def written_paths(tool_name: str | None, tool_input: Any, cwd: str) -> list[str]:
    """The files a tool call wrote, absolute (as given: resolved later); nothing for any other tool."""
    found: list[str] = []
    if tool_name in EDITING_TOOLS and isinstance(tool_input, dict):
        path = tool_input.get(EDITING_TOOLS[tool_name])
        if isinstance(path, str) and path:
            found.append(path)
    elif tool_name in PATCH_TOOLS:
        patch = tool_input if isinstance(tool_input, str) else None
        if isinstance(tool_input, dict):
            patch = next(
                (v for k, v in tool_input.items() if k in ("input", "patch", "command") and isinstance(v, str)), None
            )
        if patch:
            found += [m.strip() for m in PATCH_FILE.findall(patch) + PATCH_MOVE.findall(patch)]
    return [p if os.path.isabs(p) else os.path.join(cwd, p) for p in found if cwd or os.path.isabs(p)]


@dataclass(frozen=True)
class Conflict:
    worktree: str
    others: tuple[str, ...]  # session ids also writing there
    files: tuple[str, ...]  # written by this one and another, relative to the worktree


class WriteTracker:
    def __init__(self, window_minutes: Callable[[], float], checkouts: CheckoutCache | None = None) -> None:
        self.window_minutes = window_minutes
        self.checkouts = checkouts or CheckoutCache()
        self._lock = threading.Lock()
        self._writes: dict[str, dict[str, dict[str, float]]] = {}  # session → worktree → file → when

    def record(self, session_id: str, tool_name: str | None, tool_input: Any, cwd: str) -> None:
        """Blocking (git, cached per folder)."""
        for path in written_paths(tool_name, tool_input, cwd):
            real = os.path.realpath(path)
            folder = os.path.dirname(real)
            while folder and not os.path.isdir(folder):  # a file in a folder not made yet
                folder = os.path.dirname(folder)
            root = self.checkouts.get(folder).root if folder else None
            if not root:
                continue  # outside git: /tmp, a scratchpad, ~/.claude
            relative = os.path.relpath(real, root)
            with self._lock:
                self._writes.setdefault(session_id, {}).setdefault(root, {})[relative] = time.time()

    def writers(self) -> list[str]:
        with self._lock:
            return list(self._writes)

    def forget(self, session_id: str) -> None:
        with self._lock:
            self._writes.pop(session_id, None)

    def conflicts(self, running: set[str]) -> dict[str, list[Conflict]]:
        """Per session among `running`: each worktree another running session also wrote in, in the window."""
        since = time.time() - self.window_minutes() * 60
        with self._lock:
            recent = {
                sid: {root: {f for f, at in files.items() if at >= since} for root, files in trees.items()}
                for sid, trees in self._writes.items()
                if sid in running
            }
        by_tree: dict[str, dict[str, set[str]]] = {}
        for sid, trees in recent.items():
            for root, files in trees.items():
                if files:
                    by_tree.setdefault(root, {})[sid] = files
        found: dict[str, list[Conflict]] = {}
        for root, writers in by_tree.items():
            if len(writers) < 2:
                continue
            for sid, files in writers.items():
                others = sorted(o for o in writers if o != sid)
                shared = sorted(files & set().union(*(writers[o] for o in others)))
                found.setdefault(sid, []).append(Conflict(root, tuple(others), tuple(shared)))
        return found


class Writing:
    """What a listing asks per session (`also_writing`), worked out at most once a second for all of them."""

    def __init__(self, tracker: WriteTracker, name_of: Callable[[str], str | None]) -> None:
        self.tracker = tracker
        self.name_of = name_of
        self._at = 0.0
        self._found: dict[str, list[Conflict]] = {}

    def of(self, session_id: str) -> list[Any]:
        from muxtower.sessions.models import AlsoWriting

        if time.monotonic() - self._at > 1.0:
            self._found, self._at = self.tracker.conflicts(set(self.tracker.writers())), time.monotonic()
        return [
            AlsoWriting(worktree=c.worktree, session_id=other, name=self.name_of(other) or other, files=list(c.files))
            for c in self._found.get(session_id, [])
            for other in c.others
        ]
