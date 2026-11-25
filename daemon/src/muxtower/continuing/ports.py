from dataclasses import dataclass
from typing import Any, Protocol

from muxtower.continuing.models import ContinueStep


@dataclass(frozen=True)
class Place:
    """A conversation as the machine it ran on sees it (`place.look`)."""

    agent_id: str | None  # Claude Code's id for it, which `claude --resume` takes
    cwd: str | None  # the folder its Claude Code ran in: resumed there
    transcript: bool  # its transcript is on that machine
    live: bool  # a Claude Code process there still has it open

    def as_json(self) -> dict[str, Any]:
        return {"agent_id": self.agent_id, "cwd": self.cwd, "transcript": self.transcript, "live": self.live}

    @staticmethod
    def of(raw: Any) -> "Place":
        raw = raw if isinstance(raw, dict) else {}
        agent, cwd = raw.get("agent_id"), raw.get("cwd")
        return Place(
            agent if isinstance(agent, str) else None, cwd if isinstance(cwd, str) else None,
            raw.get("transcript") is True, raw.get("live") is True,
        )  # fmt: skip


@dataclass
class Job:
    """One Remote Control session being continued, kept (`repository.py`)."""

    remote_id: str
    machine: str
    node: str | None
    cwd: str
    agent_id: str
    name: str
    unread: bool
    step: ContinueStep
    closed: bool = False
    reason: str | None = None
    session_id: str | None = None


class JobStore(Protocol):
    def get(self, remote_id: str) -> Job | None: ...
    def save(self, job: Job) -> None: ...
