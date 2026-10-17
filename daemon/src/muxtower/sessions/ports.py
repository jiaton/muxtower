from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Protocol

from muxtower.terminal.ports import PaneRef


class SessionSource(StrEnum):
    LAUNCHED = "launched"  # started by muxtower on its own tmux socket
    ADOPTED = "adopted"  # an agent found running in some other tmux session


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
