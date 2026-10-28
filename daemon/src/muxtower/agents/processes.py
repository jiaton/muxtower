"""Every agent plugin's answer for a pane, asked in turn: the first that recognizes the pane's agent
answers (a pane runs one agent; each plugin finds only its own)."""

from muxtower.sessions.claude_processes import ClaudeProcess
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

    def running(self) -> dict[str, ClaudeProcess]:
        return {k: v for p in self.plugins for k, v in p.running().items()}
