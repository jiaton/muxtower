from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class PaneInfo:
    socket: str
    pane_id: str
    session_name: str
    command: str
    cwd: str
    pid: int = 0  # the pane's process; with pane_id it identifies a pane across tmux server restarts
    server: str = ""  # the tmux server's socket path: two socket names can lead to the same server
    activity: int = 0  # when the window last had output (epoch seconds), 0 if unknown
    alternate: bool = False  # a full-screen program draws on the alternate screen: tmux keeps no scrollback


@dataclass(frozen=True)
class PaneRef:
    """Where a session's pane lives: a tmux server (socket name, "default" = the user's own) + pane id."""

    socket: str
    pane_id: str


class TmuxPort(Protocol):
    def new_session(
        self, socket: str, name: str, cwd: str, argv: list[str], env: dict[str, str], cols: int, rows: int
    ) -> PaneRef: ...
    def list_panes(self, socket: str) -> list[PaneInfo]: ...
    def capture(self, pane: PaneRef, ansi: bool = False, history: int = 0) -> str | None: ...
    def send_text(self, pane: PaneRef, text: str) -> None: ...
    def send_key(self, pane: PaneRef, key: str) -> None: ...
    def resize(self, pane: PaneRef, cols: int, rows: int) -> None: ...
    def release_size(self, pane: PaneRef) -> None: ...
    def kill_session(self, socket: str, name: str) -> None: ...
