from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Protocol


@dataclass
class ConciergeState:
    session_id: str | None = None
    watched: list[str] = field(default_factory=list)
    names: dict[str, str] = field(default_factory=dict)  # each watched session's name when it was watched
    # What each watched session was last seen as (state, reply hash) and the conversation item it was told
    # up to, so what happens while the daemon is down is told after it.
    seen: dict[str, list[str]] = field(default_factory=dict)
    cursors: dict[str, int] = field(default_factory=dict)


@dataclass(frozen=True)
class RecordedEvent:
    number: int
    line: str
    delivered: bool


class ConciergeEvents(Protocol):
    """The events told to the concierge, kept on the hub (the latest few hundred), with what is still to tell."""

    def next_number(self) -> int: ...
    def add(self, number: int, at: datetime, session_id: str, line: str) -> None: ...
    def after(self, number: int, limit: int) -> list[RecordedEvent]: ...
    def undelivered(self) -> list[RecordedEvent]: ...
    def mark_delivered(self, up_to: int) -> None: ...


class ConciergeStore(Protocol):
    def load(self) -> ConciergeState: ...
    def save(self, state: ConciergeState) -> None: ...
    def write_private(self, name: str, content: str) -> Path:
        """A file only the owner can read (mode 0600), for the session's MCP config and instructions."""
        ...
