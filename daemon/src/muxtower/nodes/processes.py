"""Where the Claude sessions the hub lists from its own Remote Control run, when that is on a node.

A Claude Code process with Remote Control on keeps a file on its own machine naming its session
(`sessions/claude_processes.py`), so a node knows which of the account's sessions run there without
listing them itself (no Remote Control of its own, no Claude login read): it reports their ids, folders
and how they were started (`running`), and the hub lists them as that computer's. A session in a
folder of a kind of machine (`/Users/…`) whose process is not running is taken for the one node of
that kind, when there is just one."""

from typing import Any

from muxtower.nodes.hub import Nodes
from muxtower.sessions.claude_processes import ClaudeProcess


def report(running: dict[str, ClaudeProcess]) -> list[dict[str, Any]]:
    """What a node says of the processes on its own machine (not those its own nodes report)."""
    return sorted(
        ({"remote_id": rid, "cwd": p.cwd, "entrypoint": p.entrypoint} for rid, p in running.items() if not p.machine),
        key=lambda r: str(r["remote_id"]),
    )


def platform_of(cwd: str | None) -> str | None:
    """The kind of machine a folder is on, where the path says it (a Linux path could be anywhere)."""
    if not cwd:
        return None
    if cwd.startswith("/Users/"):
        return "darwin"
    if len(cwd) > 2 and cwd[0].isalpha() and cwd[1] == ":" and cwd[2] in "\\/":
        return "win32"
    return None


class NodeProcesses:
    """The nodes' Claude Code processes, as one more `ClaudeProcessPort` of the hub: they say where a
    session runs; no pane here is theirs."""

    def __init__(self, nodes: Nodes) -> None:
        self.nodes = nodes

    def remote_id(self, pane_pid: int, screen: str = "") -> str | None:
        return None

    def transcript(self, pane_pid: int, screen: str = "") -> str | None:
        return None

    def name(self, pane_pid: int, screen: str = "") -> str | None:
        return None

    def running(self) -> dict[str, ClaudeProcess]:
        found: dict[str, ClaudeProcess] = {}
        for name, node in self.nodes.all().items():
            for raw in node.record.running:
                if isinstance(raw, dict) and isinstance(raw.get("remote_id"), str):
                    entrypoint = raw.get("entrypoint")
                    found[raw["remote_id"]] = ClaudeProcess(
                        pid=0, cwd=str(raw.get("cwd") or ""), machine=name,
                        entrypoint=str(entrypoint) if entrypoint else None,
                    )  # fmt: skip
        return found

    def machine_for(self, cwd: str | None) -> str | None:
        """The one node on the kind of machine this folder is on, if there is exactly one."""
        platform = platform_of(cwd)
        if platform is None:
            return None
        names = [name for name, node in self.nodes.all().items() if node.record.platform == platform]
        return names[0] if len(names) == 1 else None

    def named(self, machine: str) -> str | None:
        """A node's own spelling of a machine name the owner typed ("Mac" for the node "mac")."""
        return next((name for name in self.nodes.all() if name.lower() == machine.lower()), None)
