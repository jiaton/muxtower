from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Protocol

from muxtower.terminal.models import ImageInput
from muxtower.terminal.ports import PaneRef

if TYPE_CHECKING:
    from muxtower.runtimes.models import AgentState
    from muxtower.sessions.claude_processes import ClaudeProcess
    from muxtower.sessions.models import Conversation, Session


class SessionSource(StrEnum):
    LAUNCHED = "launched"  # started by muxtower on its own tmux socket
    ADOPTED = "adopted"  # an agent found running in some other tmux session
    REMOTE_CONTROL = "remote_control"  # a Claude Code Remote Control session, reached through Anthropic
    CODEX = "codex"  # a Codex thread muxtower runs headless, in its own Codex app-server
    CODEX_SHARED = "codex_shared"  # a thread of the Codex app-server shared by this machine's Codex clients


@dataclass
class SessionRecord:
    id: str
    name: str
    runtime: str
    cwd: str
    source: SessionSource
    pane: PaneRef
    tmux_session: str
    hook_token_hash: str | None
    auto_approve: bool
    created_at: datetime
    named: bool = False  # the owner named it in muxtower: kept over the name its agent gives itself
    launch_args: list[str] | None = None  # the agent's options it was started with (no prompt): to start it again
    agent_id: str | None = None  # the agent's own id for its conversation (Claude Code's session, Codex's thread)
    server_id: str | None = None  # the tmux server it ran in (`TmuxPort.server_id`)
    interrupted_at: datetime | None = None  # its machine restarted under it: kept to be resumed (`recovery/`)


class SessionRepository(Protocol):
    def list(self) -> list[SessionRecord]: ...
    def get(self, session_id: str) -> SessionRecord | None: ...
    def upsert(self, record: SessionRecord) -> None: ...
    def delete(self, session_id: str) -> None: ...
    def save_hook_state(self, session_id: str, state: str | None) -> None: ...
    def load_hook_state(self, session_id: str) -> str | None: ...


@dataclass(frozen=True)
class ArchiveRecord:
    session_id: str
    remote_id: str | None
    session: str  # the last view, JSON
    transcript: str | None
    items: str | None  # conversation items, JSON, when there is no transcript
    archived_at: datetime


class ArchiveRepository(Protocol):
    def list(self) -> list[ArchiveRecord]: ...
    def add(self, record: ArchiveRecord) -> None: ...
    def delete(self, session_id: str) -> None: ...


class ClaudeProcessPort(Protocol):
    def remote_id(self, pane_pid: int, screen: str = "") -> str | None:
        """The controller session of the agent running in this pane (Claude Code's Remote Control, a Codex
        thread of the shared app-server), if it has one."""
        ...

    def running(self) -> dict[str, ClaudeProcess]:
        """Claude Code processes on this machine with Remote Control on, by remote session id."""
        ...

    def transcript(self, pane_pid: int, screen: str = "") -> str | None:
        """The transcript file of the agent session running in this pane, if any. `screen` is what the pane
        shows, for an agent that has to be told from its neighbours by what was said in it."""
        ...

    def name(self, pane_pid: int, screen: str = "") -> str | None:
        """The name the agent session running in this pane goes by (/rename, or its own), if any."""
        ...


class HeadlessStarter(Protocol):
    """A source that also starts sessions of one runtime without a terminal."""

    runtime: str

    def start(self, cwd: str, name: str | None) -> Session: ...


class SessionSourcePort(Protocol):
    """Sessions muxtower reaches other than through local tmux (e.g. Remote Control). A source owns
    the ids it lists, keeps its own cache fresh, and does the actions its sessions' capabilities offer."""

    def owns(self, session_id: str) -> bool: ...
    def views(self) -> list[Session]: ...
    def get(self, session_id: str) -> Session: ...
    def conversation(self, session_id: str, after: int, limit: int) -> Conversation: ...
    def approve(
        self, session_id: str, option: str | None, answers: list[list[str]] | None = None
    ) -> tuple[AgentState, str]: ...
    def deny(self, session_id: str) -> AgentState: ...
    def send_text(self, session_id: str, text: str, images: list[ImageInput] | None = None) -> None: ...
    def send_key(self, session_id: str, key: str) -> None: ...
    def mark_read(self, session_id: str) -> None: ...
    def archive(self, session_id: str) -> None:
        """Ends the session on its source and archives it there (gone from its lists)."""
        ...

    def detect_folder(self, session_id: str) -> str | None:
        """The folder the session's whole history names, if any (slow: reads all of it)."""
        ...
