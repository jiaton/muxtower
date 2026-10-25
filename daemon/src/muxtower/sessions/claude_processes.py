"""Which Remote Control session a pane's Claude Code process belongs to.

Claude Code keeps a file per running process, `~/.claude/sessions/<pid>.json`, whose `bridgeSessionId`
(`session_<id>`) is that process's Remote Control session (`cse_<id>` in the API). The pane's own process
may be a shell, so its children are searched too. The file also says how Claude Code was started
(`entrypoint`: `cli`, `sdk-cli`, the desktop app or an IDE…), which is what the session's origin is. Its
`tmux` field is not used: workers spawned by `claude remote-control` inherit it from wherever the server
was started."""

import json
import os
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


def _children(pid: int) -> list[int]:
    found: list[int] = []
    try:
        for task in Path(f"/proc/{pid}/task").iterdir():
            found += [int(c) for c in (task / "children").read_text().split()]
    except (OSError, ValueError):
        pass
    return found


class ClaudeProcesses:
    def __init__(self, claude_dir: Path | None = None) -> None:
        home = claude_dir or Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude")
        self.sessions_dir = home / "sessions"
        self._running: tuple[float, dict[str, ClaudeProcess]] = (0.0, {})

    def _family(self, pid: int, depth: int = SEARCH_DEPTH) -> Iterator[int]:
        yield pid
        if depth:
            for child in _children(pid):
                yield from self._family(child, depth - 1)

    def remote_id(self, pane_pid: int) -> str | None:
        for pid in self._family(pane_pid):
            try:
                info = json.loads((self.sessions_dir / f"{pid}.json").read_text())
            except (OSError, ValueError):
                continue
            return _remote_id(info)  # None: the pane's Claude Code runs without Remote Control
        return None

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
