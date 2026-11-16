"""Every agent plugin's answer for a pane, asked in turn: the first that recognizes the pane's agent
answers (a pane runs one agent; each plugin finds only its own)."""

from muxtower.sessions.claude_processes import ClaudeProcess
from muxtower.sessions.naming import AgentName
from muxtower.sessions.ports import ClaudeProcessPort


class AgentProcesses:
    def __init__(self, plugins: list[ClaudeProcessPort]) -> None:
        self.plugins = plugins

    def remote_id(self, pane_pid: int, screen: str = "") -> str | None:
        return next((found for p in self.plugins if (found := p.remote_id(pane_pid, screen))), None)

    def transcript(self, pane_pid: int, screen: str = "") -> str | None:
        return next((found for p in self.plugins if (found := p.transcript(pane_pid, screen))), None)

    def name(self, pane_pid: int, screen: str = "") -> str | None:
        return next((found for p in self.plugins if (found := p.name(pane_pid, screen))), None)

    def name_origin(self, pane_pid: int, screen: str = "") -> AgentName | None:
        for p in self.plugins:
            if (ask := getattr(p, "name_origin", None)) and (found := ask(pane_pid, screen)):
                return found  # type: ignore[no-any-return]
        return None

    def moved(self, pane_pid: int, screen: str = "") -> bool:
        """Whether the pane's agent moved its conversation to a process of its own (Claude Code's background)."""
        return any((ask := getattr(p, "moved", None)) and ask(pane_pid, screen) for p in self.plugins)

    def former_remote_ids(self, pane_pid: int) -> list[str]:
        """Remote Control sessions the pane's conversation ran before (`ClaudeProcesses.former_remote_ids`)."""
        found: list[str] = []
        for p in self.plugins:
            if ask := getattr(p, "former_remote_ids", None):
                found += ask(pane_pid)
        return found

    def transcript_for(self, agent_id: str) -> str | None:
        """A conversation's transcript by its agent's own id (`ClaudeProcesses.transcript_for`)."""
        for p in self.plugins:
            if (ask := getattr(p, "transcript_for", None)) and (found := ask(agent_id)):
                return found  # type: ignore[no-any-return]
        return None

    def ended_bridges(self) -> dict[str, str]:
        """Bridges of muxtower's tmux sessions whose agent has ended (`ClaudeProcesses.ended_bridges`)."""
        found: dict[str, str] = {}
        for p in self.plugins:
            if ask := getattr(p, "ended_bridges", None):
                found |= ask()
        return found

    def running(self) -> dict[str, ClaudeProcess]:
        return {k: v for p in self.plugins for k, v in p.running().items()}
