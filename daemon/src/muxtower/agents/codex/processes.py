"""Which Codex session a tmux pane runs.

Codex keeps no file per process (Claude Code does), but while a session runs its process holds the
session's rollout file open for appending: the pane's process, or one it started, has an open file
`<codex home>/sessions/…/rollout-<time>-<thread id>.jsonl`. The rollout is the transcript; the thread's
name (what `/rename` set, else its title) is in Codex's state database, read without writing. A
session's rollout is only created with its first message, so a fresh Codex has none yet. Codex has no
Remote Control, so no remote id.
"""

import os
import re
import sqlite3
from pathlib import Path

from muxtower.infra.procfs import Children, family
from muxtower.sessions.claude_processes import ClaudeProcess

SEARCH_DEPTH = 3
THREAD_ID = re.compile(r"rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$")
STATE_DB = "state_5.sqlite"


class CodexProcesses:
    def __init__(self, codex_home: Path | None = None, proc: Path = Path("/proc")) -> None:
        self.home = codex_home or Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex")
        self.sessions = str(self.home / "sessions") + os.sep
        self.proc = proc

    def _rollout(self, pane_pid: int) -> str | None:
        """The rollout file the pane's Codex holds open, if it runs one."""
        for pid in family(pane_pid, Children(self.proc), SEARCH_DEPTH):
            try:
                fds = list((self.proc / str(pid) / "fd").iterdir())
            except OSError:
                continue
            for fd in fds:
                try:
                    target = os.readlink(fd)
                except OSError:
                    continue
                if target.startswith(self.sessions) and THREAD_ID.search(target):
                    return target
        return None

    def remote_id(self, pane_pid: int) -> str | None:
        return None

    def transcript(self, pane_pid: int) -> str | None:
        return self._rollout(pane_pid)

    def name(self, pane_pid: int) -> str | None:
        rollout = self._rollout(pane_pid)
        found = THREAD_ID.search(rollout) if rollout else None
        if not found:
            return None
        try:
            with sqlite3.connect(f"file:{self.home / STATE_DB}?mode=ro", uri=True, timeout=1) as db:
                row = db.execute("SELECT name, title FROM threads WHERE id = ?", (found.group(1),)).fetchone()
        except sqlite3.Error:
            return None
        name = next((str(v).strip() for v in row or () if v and str(v).strip()), None)
        return name[:80] if name else None

    def running(self) -> dict[str, ClaudeProcess]:
        return {}
