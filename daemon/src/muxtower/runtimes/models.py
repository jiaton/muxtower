from enum import StrEnum

from pydantic import BaseModel, Field


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


class QuestionOption(BaseModel):
    label: str
    description: str | None = None


class PendingQuestion(BaseModel):
    """One question of an agent's multiple-choice prompt (Claude Code's AskUserQuestion), all of whose
    questions are answered together (`Approve.answers`)."""

    question: str
    header: str | None = None
    multi_select: bool = Field(default=False, description="any number of its options may be picked")
    options: list[QuestionOption]


class ModeInfo(BaseModel):
    id: str
    label: str
    dangerous: bool = False


class RuntimeInfo(BaseModel):
    name: str
    binary: str
    available: bool
    has_hooks: bool
    headless: bool = False  # can also run without a terminal (Codex in muxtower's app-server)
    permission_modes: list[ModeInfo] = Field(default_factory=list, description="least to most permissive")
    default_mode: str = Field(default="agent", description='new sessions\' mode unless asked: "agent" adds none')
