"""Which Remote Control session a pane's Claude Code process belongs to.

Claude Code keeps a file per running process, `~/.claude/sessions/<pid>.json`, whose `bridgeSessionId`
(`session_<id>`) is that process's Remote Control session (`cse_<id>` in the API). The pane's own process
may be a shell, so its children are searched too. The file's `tmux` field is not used: workers spawned by
`claude remote-control` inherit it from wherever the server was started."""

import json
import os
from collections.abc import Iterator
from pathlib import Path

SEARCH_DEPTH = 3
BRIDGE_PREFIX = "session_"
REMOTE_PREFIX = "cse_"


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
            bridge = info.get("bridgeSessionId") if isinstance(info, dict) else None
            if isinstance(bridge, str) and bridge.startswith(BRIDGE_PREFIX):
                return REMOTE_PREFIX + bridge.removeprefix(BRIDGE_PREFIX)
            return None  # the pane's Claude Code runs without Remote Control
        return None
