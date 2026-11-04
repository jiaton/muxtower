from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass
class TeamRecord:
    session_id: str
    role: str | None = None
    note: str | None = None
    project: str | None = None
    project_auto: bool = False  # worked out by muxtower (from git), not set by an agent or the owner
    agent_id: str | None = None  # the agent's own id for it (Claude Code's session id, Codex's thread id)
    project_source: str | None = None  # when worked out: git remote | git root | folder


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
    branch: str | None = None  # None: detached, or no repository
    repo: str | None = None  # the repository's main folder, shared by all its worktrees
    remote: str | None = None  # its origin, as `owner/repo`


@dataclass
class Task:
    """Work one session sent another. `text` is whole while it is held; the record keeps its start."""

    id: int
    at: datetime
    from_id: str | None  # None: sent from a device, not a session
    from_label: str  # "<name> (<role>)", as the prefix says it
    to_id: str
    text: str
    status: str  # delivered | held | undeliverable
    delivered_at: datetime | None = None


class TaskRepository(Protocol):
    def add(self, task: Task) -> Task:
        """Stores it (its id given here) and drops the oldest past the latest few hundred."""
        ...

    def update(self, task: Task) -> None: ...
    def held(self) -> list[Task]: ...
    def involving(self, session_id: str, limit: int) -> list[Task]:
        """The latest tasks it was sent or sent, newest first."""
        ...

    def latest_to(self, session_ids: list[str], each: int) -> dict[str, list[Task]]: ...
