"""API schemas for sessions (what clients see)."""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from muxtower.runtimes.models import AgentState, Option
from muxtower.sessions.ports import SessionSource


class StateSource(StrEnum):
    HOOK = "hook"  # structured event from the agent
    SCREEN = "screen"  # a screen rule matched
    DEFAULT = "default"  # nothing matched; the runtime's default state


class PendingAction(BaseModel):
    """What the agent is waiting for. tool_name/detail come from hooks; options from the screen."""

    state: AgentState
    tool_name: str | None = None
    detail: str | None = None
    options: list[Option] = Field(default_factory=list)


class Session(BaseModel):
    id: str
    name: str
    runtime: str
    cwd: str
    source: SessionSource
    tmux_socket: str = Field(description='tmux server: "default" or a -L socket name')
    tmux_session: str
    state: AgentState
    state_source: StateSource
    matched_rule: str | None
    needs_attention: bool
    pending: PendingAction | None
    last_message: str | None
    auto_approve: bool
    can_auto_approve: bool
    created_at: datetime
    updated_at: datetime


class CreateSession(BaseModel):
    runtime: str
    cwd: str
    name: str | None = None
    args: list[str] = Field(default_factory=list, description="extra arguments for the agent binary")


class UpdateSession(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    auto_approve: bool | None = None
