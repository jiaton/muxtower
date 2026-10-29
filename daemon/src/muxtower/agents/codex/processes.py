"""Which Codex session a tmux pane runs.

Codex keeps no file per process (Claude Code does), but while a session runs its process holds the
session's rollout file open for appending: the pane's process, or one it started, has an open file
`<codex home>/sessions/…/rollout-<time>-<thread id>.jsonl`. The rollout is the transcript; the thread's
name (what `/rename` set, else its title) is in Codex's state database, read without writing. A
session's rollout is only created with its first message, so a fresh Codex has none yet. Codex has no
Remote Control, so no remote id.

Since 0.16x a plain `codex` is a client of Codex's shared app-server, and that process, not the pane's,
holds the rollout. Then the thread is found in the state database from what the pane's `codex` process
says of itself: a thread id on its command line (`codex resume <id>`), else the interactive threads
(`originator = 'codex-tui'`) of its folder that were active since it started and are not held open by a Codex of
its own (muxtower's launched ones are), the one whose first message the pane shows, else the most
recently active. Two Codex in one folder that have scrolled their first messages away can still swap.
"""

import os
import re
import sqlite3
import time
from contextlib import closing
from pathlib import Path

from muxtower.infra.procfs import Children, all_commands, argv_of, cwd_of, family, open_files, started_at
from muxtower.sessions.claude_processes import ClaudeProcess

SEARCH_DEPTH = 3
THREAD_ID = re.compile(r"rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$")
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
STATE_DB = "state_5.sqlite"
SHARED_TTL_SECONDS = 3.0  # an answer is kept this long when no thread was found, FOUND_TTL_SECONDS when one was
FOUND_TTL_SECONDS = 10.0
FORGET_SECONDS = 120.0  # an answer for a pane nobody has asked about for this long is dropped
START_SLACK_SECONDS = 5
CANDIDATES = 20
SEEN_CHARS = 60  # of a first message, enough to tell it from the others
# With any of these on its command line Codex runs in its own process, not as a client of the shared app-server.
EMBEDDED = ("-c", "--config", "--enable", "--disable", "--search")


def is_codex_client(argv: list[str]) -> bool:
    """A `codex` someone types into (not an app-server, an `exec` run or an MCP server)."""
    return os.path.basename(argv[0]) == "codex" and not {"app-server", "exec", "mcp-server"} & set(argv[1:3])


def runs_embedded(argv: list[str]) -> bool:
    return any(
        a in EMBEDDED or a.startswith(("--config=", "--enable=", "--disable=", "-c")) and "=" in a for a in argv[1:]
    )


class CodexProcesses:
    def __init__(self, codex_home: Path | None = None, proc: Path = Path("/proc"), shared: bool = True) -> None:
        self.home = codex_home or Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex")
        self.sessions = str(self.home / "sessions") + os.sep
        self.proc = proc
        self.shared = shared  # the threads of the shared app-server can be driven from here (`SharedCodexSource`)
        self._found: dict[int, tuple[float, tuple[str, str] | None]] = {}  # pane pid -> (when, thread)
        self._seen: tuple[float, dict[int, list[str]], set[str]] = (-SHARED_TTL_SECONDS, {}, set())

    def _rollout(self, pane_pid: int) -> str | None:
        """The rollout file the pane's Codex holds open, if it runs one."""
        pids = list(family(pane_pid, Children(self.proc), SEARCH_DEPTH))
        return next(
            (f for f in open_files(pids, self.proc) if f.startswith(self.sessions) and THREAD_ID.search(f)), None
        )

    def _query(self, sql: str, args: tuple[object, ...]) -> list[tuple[object, ...]]:
        try:
            # closed here: `with` on a connection only ends its transaction, and each one left to the garbage
            # collector keeps the database and its WAL open (macOS gives a process 256 files)
            with closing(sqlite3.connect(f"file:{self.home / STATE_DB}?mode=ro", uri=True, timeout=1)) as db:
                return db.execute(sql, args).fetchall()
        except sqlite3.Error:
            return []

    def _tui(self, pane_pid: int) -> int | None:
        """The pane's interactive `codex` process (not an app-server or a hook relay)."""
        for pid in family(pane_pid, Children(self.proc), SEARCH_DEPTH):
            if (argv := argv_of(pid, self.proc)) and is_codex_client(argv):
                return pid
        return None

    def _clients(self) -> tuple[dict[int, list[str]], set[str]]:
        """Every Codex someone types into on this machine, and the rollouts those hold open themselves (those
        threads are theirs, not the shared app-server's). Looked at once for all panes, every few seconds."""
        at, clients, held = self._seen
        if time.monotonic() - at >= SHARED_TTL_SECONDS:
            clients = {pid: argv for pid, argv in all_commands(self.proc).items() if is_codex_client(argv)}
            held = {f for f in open_files(clients, self.proc) if f.startswith(self.sessions)}
            self._seen = (time.monotonic(), clients, held)
        return clients, held

    def _shared_thread(self, pane_pid: int, screen: str) -> tuple[str, str] | None:
        """(thread id, rollout) of a Codex that runs in the shared app-server, from the state database."""
        now = time.monotonic()
        for gone in [p for p, (at, _) in self._found.items() if now - at > FORGET_SECONDS]:
            del self._found[gone]
        at, found = self._found.get(pane_pid, (-FOUND_TTL_SECONDS, None))
        if now - at < (FOUND_TTL_SECONDS if found else SHARED_TTL_SECONDS):
            return found
        found = self._lookup(pane_pid, screen)
        self._found[pane_pid] = (now, found)
        return found

    def _lookup(self, pane_pid: int, screen: str) -> tuple[str, str] | None:
        pid = self._tui(pane_pid)
        if pid is None:
            return None
        argv, cwd = argv_of(pid, self.proc) or [], cwd_of(pid, self.proc)
        if not cwd or runs_embedded(argv):  # one with an app-server of its own is not in the shared one
            return None
        named = next((m.group() for a in argv[1:] if (m := UUID.fullmatch(a))), None)  # codex resume <id>
        if named:
            rows = self._query("SELECT id, rollout_path, '' FROM threads WHERE id = ? AND archived = 0", (named,))
            return (str(rows[0][0]), str(rows[0][1])) if rows and os.path.isfile(str(rows[0][1])) else None
        started = started_at(pid, self.proc) or 0.0
        rows = self._query(
            "SELECT id, rollout_path, first_user_message FROM threads "
            "WHERE originator = 'codex-tui' AND archived = 0 AND cwd = ? AND updated_at >= ? "
            "ORDER BY updated_at DESC, created_at DESC LIMIT ?",
            (cwd, int(started) - START_SLACK_SECONDS, CANDIDATES),
        )
        clients, held = self._clients()
        rows = [r for r in rows if str(r[1]) not in held]
        seen = " ".join(screen.split()).lower()
        shown = [r for r in rows if (first := " ".join(str(r[2]).split()).lower()[:SEEN_CHARS]) and first in seen]
        if not shown:
            # Nothing on the screen says which. If another Codex of the shared app-server runs in this folder,
            # any of them could be the one; with none, the most recent one is.
            peers = [p for p, a in clients.items() if p != pid and not runs_embedded(a) and cwd_of(p, self.proc) == cwd]
            if peers:
                return None
        rows = shown or rows
        return (str(rows[0][0]), str(rows[0][1])) if rows and os.path.isfile(str(rows[0][1])) else None

    def _thread(self, pane_pid: int, screen: str) -> tuple[str, str] | None:
        rollout = self._rollout(pane_pid)
        found = THREAD_ID.search(rollout) if rollout else None
        return (found.group(1), rollout) if found and rollout else self._shared_thread(pane_pid, screen)

    def remote_id(self, pane_pid: int, screen: str = "") -> str | None:
        """The thread of a Codex that runs in the shared app-server, which is where it can be driven from
        (`SharedCodexSource`); one with an app-server of its own is only a terminal."""
        if not self.shared or self._rollout(pane_pid):
            return None
        thread = self._shared_thread(pane_pid, screen)
        return thread[0] if thread else None

    def transcript(self, pane_pid: int, screen: str = "") -> str | None:
        thread = self._thread(pane_pid, screen)
        return thread[1] if thread else None

    def name(self, pane_pid: int, screen: str = "") -> str | None:
        thread = self._thread(pane_pid, screen)
        if not thread:
            return None
        row = next(iter(self._query("SELECT name, title FROM threads WHERE id = ?", (thread[0],))), None)
        name = next((str(v).strip() for v in row or () if v and str(v).strip()), None)
        return name[:80] if name else None

    def running(self) -> dict[str, ClaudeProcess]:
        return {}
