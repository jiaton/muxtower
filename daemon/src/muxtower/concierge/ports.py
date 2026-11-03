from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol


@dataclass
class ConciergeState:
    session_id: str | None = None
    watched: list[str] = field(default_factory=list)
    names: dict[str, str] = field(default_factory=dict)  # each watched session's name when it was watched
    events: int = 0  # the last event's number


class ConciergeStore(Protocol):
    def load(self) -> ConciergeState: ...
    def save(self, state: ConciergeState) -> None: ...
    def write_private(self, name: str, content: str) -> Path:
        """A file only the owner can read (mode 0600), for the session's MCP config and instructions."""
        ...
