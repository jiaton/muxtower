from dataclasses import dataclass
from typing import Protocol


@dataclass
class TeamRecord:
    session_id: str
    role: str | None = None
    note: str | None = None
    project: str | None = None
    project_auto: bool = False  # worked out by muxtower (from git), not set by an agent or the owner


class TeamRepository(Protocol):
    def load(self) -> dict[str, TeamRecord]: ...
    def save(self, record: TeamRecord) -> None: ...
    def rename_project(self, old: str, new: str) -> int:
        """Every session of project `old` moves to `new`; returns how many."""
        ...


@dataclass(frozen=True)
class Checkout:
    """Where a folder sits in git: what the project is called after, and the checkout it is in."""

    project: str
    source: str  # git remote | git root | folder
    root: str | None = None  # the worktree's top folder
    branch: str | None = None
