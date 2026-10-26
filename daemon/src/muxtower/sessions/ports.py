from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Protocol

from muxtower.terminal.ports import PaneRef

if TYPE_CHECKING:
    from muxtower.runtimes.models import AgentState
    from muxtower.sessions.claude_processes import ClaudeProcess
    from muxtower.sessions.models import Conversation, Session


class SessionSource(StrEnum):
    LAUNCHED = "launched"  # started by muxtower on its own tmux socket
    ADOPTED = "adopted"  # an agent found running in some other tmux session
    REMOTE_CONTROL = "remote_control"  # a Claude Code Remote Control session, reached through Anthropic


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
    def remote_id(self, pane_pid: int) -> str | None:
        """The Remote Control session of the Claude Code process running in this pane, if any."""
        ...

    def running(self) -> dict[str, ClaudeProcess]:
        """Claude Code processes on this machine with Remote Control on, by remote session id."""
        ...

    def transcript(self, pane_pid: int) -> str | None:
        """The transcript file of the Claude Code session running in this pane, if any."""
        ...


class SessionSourcePort(Protocol):
    """Sessions muxtower reaches other than through local tmux (e.g. Remote Control). A source owns
    the ids it lists, keeps its own cache fresh, and does the actions its sessions' capabilities offer."""

    def owns(self, session_id: str) -> bool: ...
    def views(self) -> list[Session]: ...
    def get(self, session_id: str) -> Session: ...
    def conversation(self, session_id: str, after: int, limit: int) -> Conversation: ...
    def approve(self, session_id: str, option: str | None) -> tuple[AgentState, str]: ...
    def deny(self, session_id: str) -> AgentState: ...
    def send_text(self, session_id: str, text: str) -> None: ...
    def send_key(self, session_id: str, key: str) -> None: ...
    def mark_read(self, session_id: str) -> None: ...
    def archive(self, session_id: str) -> None:
        """Ends the session on its source and archives it there (gone from its lists)."""
        ...

    def detect_folder(self, session_id: str) -> str | None:
        """The folder the session's whole history names, if any (slow: reads all of it)."""
        ...
