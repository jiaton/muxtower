from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from muxtower.hooks.events import AskingTools, HookEvent


@dataclass(frozen=True)
class HookLaunch:
    """One session muxtower starts, as its hooks need to know it."""

    session_id: str
    token: str  # the session's hook token: hooks present it, the daemon keeps only its hash
    url: str  # where its events are received: <daemon>/v1/hooks/<harness>
    files: Path  # where a harness keeps the files it writes for the session (named after its id)
    mcp_url: str | None = None  # this daemon's MCP endpoint, for the session to reach as itself

    @property
    def mcp_token(self) -> str:
        """What the session presents to the MCP endpoint: its id and hook token (`mcp/caller.py`)."""
        return session_token(self.session_id, self.token)


SESSION_TOKEN_PREFIX = "session."  # noqa: S105 - a prefix, not a secret
MCP_SERVER = "muxtower"
MCP_TOKEN_ENV = "MUXTOWER_MCP_TOKEN"  # noqa: S105 - the variable's name


def session_token(session_id: str, hook_token: str) -> str:
    return f"{SESSION_TOKEN_PREFIX}{session_id}.{hook_token}"


class HookHarness(Protocol):
    """An agent harness whose hooks muxtower wires up for the sessions it starts (a runtime's `hooks`).

    It says how its agent is told to report (`launch_args`, without touching the owner's own config),
    how to read what it reports (`event`, in Claude Code's vocabulary), and which tool calls are the
    agent asking the owner. Events arrive at `POST /v1/hooks/<name>` with the session's id and token."""

    name: str
    asking: AskingTools

    def launch_args(self, launch: HookLaunch) -> list[str]:
        """Arguments for the agent's command line; may write files into `launch.files`. With
        `launch.mcp_url`, they also give it muxtower's MCP server, reached with `launch.mcp_token`."""
        ...

    def event(self, body: bytes) -> HookEvent:
        """Raises ValueError for a body that is not one of its events."""
        ...
