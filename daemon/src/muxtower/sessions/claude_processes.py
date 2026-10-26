"""Which Remote Control session a pane's Claude Code process belongs to.

Claude Code keeps a file per running process, `~/.claude/sessions/<pid>.json`, whose `bridgeSessionId`
(`session_<id>`) is that process's Remote Control session (`cse_<id>` in the API). The pane's own process
may be a shell, so its children are searched too (some kernels keep no list of children: then every
process's parent is read). Its `sessionId` names the transcript Claude Code writes,
`projects/<cwd, every non-alphanumeric as ->/<sessionId>.jsonl`. The file also says how Claude Code was started
(`entrypoint`: `cli`, `sdk-cli`, the desktop app or an IDE…), which is what the session's origin is. Its
`tmux` field is not used: workers spawned by `claude remote-control` inherit it from wherever the server
was started."""

import json
import os
import re
import time
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

SEARCH_DEPTH = 3
BRIDGE_PREFIX = "session_"
REMOTE_PREFIX = "cse_"
RUNNING_TTL_SECONDS = 5.0


@dataclass(frozen=True)
class ClaudeProcess:
    pid: int
    cwd: str
    entrypoint: str | None = None

    @property
    def origin(self) -> str | None:
        """In the vocabulary of Remote Control's `origin` (claude_code_cli, claude_code_sdk_cli…)."""
        return f"claude_code_{self.entrypoint.replace('-', '_')}" if self.entrypoint else None


def _remote_id(info: object) -> str | None:
    bridge = info.get("bridgeSessionId") if isinstance(info, dict) else None
    if isinstance(bridge, str) and bridge.startswith(BRIDGE_PREFIX):
        return REMOTE_PREFIX + bridge.removeprefix(BRIDGE_PREFIX)
    return None


class _Children:
    """Children of processes, for one search: from `/proc/<pid>/task/*/children` where the kernel keeps it,
    else (kernels built without it) from every process's parent, read once."""

    def __init__(self, proc: Path = Path("/proc")) -> None:
        self.proc = proc
        self._by_parent: dict[int, list[int]] | None = None

    def __call__(self, pid: int) -> list[int]:
        found: list[int] = []
        try:
            for task in (self.proc / str(pid) / "task").iterdir():
                found += [int(c) for c in (task / "children").read_text().split()]
            return found
        except FileNotFoundError:
            pass
        except (OSError, ValueError):
            return found
        if self._by_parent is None:
            self._by_parent = {}
            for child, parent in self._parents():
                self._by_parent.setdefault(parent, []).append(child)
        return self._by_parent.get(pid, [])

    def _parents(self) -> Iterator[tuple[int, int]]:
        """(pid, parent pid) of every process, from `/proc/<pid>/stat`: the parent is the second field
        after the command name, which is in parentheses and may hold anything."""
        for entry in self.proc.iterdir():
            if not entry.name.isdigit():
                continue
            try:
                fields = (entry / "stat").read_text().rsplit(")", 1)[1].split()
                yield int(entry.name), int(fields[1])
            except (OSError, IndexError, ValueError):
                continue


class ClaudeProcesses:
    def __init__(self, claude_dir: Path | None = None, proc: Path = Path("/proc")) -> None:
        self.proc = proc
        home = claude_dir or Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude")
        self.sessions_dir = home / "sessions"
        self.projects_dir = home / "projects"
        self._running: tuple[float, dict[str, ClaudeProcess]] = (0.0, {})

    def _family(self, pid: int, children: _Children, depth: int = SEARCH_DEPTH) -> Iterator[int]:
        yield pid
        if depth:
            for child in children(pid):
                yield from self._family(child, children, depth - 1)

    def _info(self, pane_pid: int) -> dict[str, object] | None:
        """The process file of the pane's Claude Code, if it runs one."""
        for pid in self._family(pane_pid, _Children(self.proc)):
            try:
                info = json.loads((self.sessions_dir / f"{pid}.json").read_text())
            except (OSError, ValueError):
                continue
            return info if isinstance(info, dict) else None
        return None

    def remote_id(self, pane_pid: int) -> str | None:
        info = self._info(pane_pid)
        return _remote_id(info) if info else None  # None: no Claude Code, or one without Remote Control

    def transcript(self, pane_pid: int) -> str | None:
        """The transcript file of the pane's Claude Code session, when it exists."""
        info = self._info(pane_pid)
        if not info or not isinstance(info.get("sessionId"), str) or not isinstance(info.get("cwd"), str):
            return None
        path = self.projects_dir / re.sub(r"[^A-Za-z0-9]", "-", str(info["cwd"])) / f"{info['sessionId']}.jsonl"
        return str(path) if path.is_file() else None

    def running(self) -> dict[str, ClaudeProcess]:
        """Every Claude Code process alive on this machine that runs Remote Control, by remote session
        id, in tmux or not (e.g. workers of `claude remote-control`). Cached for a few seconds."""
        at, found = self._running
        if time.monotonic() - at < RUNNING_TTL_SECONDS:
            return found
        found = {}
        for path in self.sessions_dir.glob("*.json"):
            try:
                info = json.loads(path.read_text())
                pid = int(info.get("pid") or path.stem)
            except (OSError, ValueError, AttributeError):
                continue
            remote_id = _remote_id(info)
            if remote_id and Path(f"/proc/{pid}").exists():
                entrypoint = info.get("entrypoint")
                found[remote_id] = ClaudeProcess(
                    pid=pid, cwd=str(info.get("cwd") or ""), entrypoint=str(entrypoint) if entrypoint else None
                )
        self._running = (time.monotonic(), found)
        return found
