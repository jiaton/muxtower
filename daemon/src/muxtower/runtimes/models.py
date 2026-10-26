from enum import StrEnum

from pydantic import BaseModel


class AgentState(StrEnum):
    NEEDS_PERMISSION = "needs_permission"  # a tool/command is waiting for approval
    NEEDS_ANSWER = "needs_answer"  # the agent asked a question
    NEEDS_TRUST = "needs_trust"  # workspace / MCP server trust prompt
    PLAN_REVIEW = "plan_review"  # a plan is waiting to be accepted
    ERROR = "error"
    BUSY = "busy"
    IDLE = "idle"
    UNKNOWN = "unknown"


ATTENTION_STATES = frozenset(
    {
        AgentState.NEEDS_PERMISSION,
        AgentState.NEEDS_ANSWER,
        AgentState.NEEDS_TRUST,
        AgentState.PLAN_REVIEW,
        AgentState.ERROR,
    }
)
APPROVABLE_STATES = ATTENTION_STATES - {AgentState.ERROR}


class Option(BaseModel):
    """One numbered choice in a dialog, e.g. key "2", label "Yes, allow reads during this session"."""

    key: str
    label: str


class RuntimeInfo(BaseModel):
    name: str
    binary: str
    available: bool
    has_hooks: bool
    headless: bool = False  # can also run without a terminal (Codex in muxtower's app-server)
