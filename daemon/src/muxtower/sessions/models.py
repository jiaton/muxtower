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
    REMOTE = "remote"  # reported by the agent's own controller protocol (Remote Control)


class PendingAction(BaseModel):
    """What the agent is waiting for. tool_name/detail come from hooks; options from the screen."""

    state: AgentState
    tool_name: str | None = None
    detail: str | None = None
    options: list[Option] = Field(default_factory=list)
    recommended: str | None = Field(default=None, description="option key approve picks when none is given")


class TurnSummary(BaseModel):
    """A short account of the latest turn, written by the agent's platform (Remote Control) or by us."""

    status: str | None = Field(default=None, description="e.g. completed, working, blocked")
    detail: str | None = Field(default=None, description="one line: where the work stands")
    recent: str | None = Field(default=None, description="one or two sentences: what just happened")
    needs: str | None = Field(default=None, description="what the agent needs from the owner, if anything")
    noteworthy: bool = False


class SessionRole(StrEnum):
    CONCIERGE = "concierge"  # the owner's assistant: talk to it, it talks to the others


class Capabilities(BaseModel):
    """What a client may offer for this session (sources differ)."""

    screen: bool = Field(description="a terminal screen can be shown (GET /screen)")
    conversation: bool = Field(description="structured conversation items exist (GET /conversation)")
    keys: list[str] = Field(description="tmux key names input accepts; empty = any")
    resize: bool
    terminate: bool
    rename: bool


class Session(BaseModel):
    id: str
    name: str
    runtime: str
    cwd: str
    source: SessionSource
    machine: str | None = Field(default=None, description="where it runs, as the owner named it")
    origin: str | None = Field(default=None, description="where it was started: cli, desktop_app, android…")
    tmux_socket: str | None = Field(default=None, description='tmux server: "default" or a -L socket name')
    tmux_session: str | None = None
    tmux_pane: str | None = Field(default=None, description="pane id, e.g. %12, for attaching to the exact pane")
    capabilities: Capabilities
    alt_screen: bool = Field(
        default=False,
        description="draws full screen (alternate screen): tmux keeps no scrollback, see the conversation",
    )
    role: SessionRole | None = None
    remote_id: str | None = Field(
        default=None, description="this agent's Remote Control session, when it has one; listed once, under this id"
    )
    summary: TurnSummary | None = None
    reply_summary: str | None = Field(
        default=None, description="a few lines condensing last_message, once the hub has made them (long replies)"
    )
    unread: bool = Field(
        default=False, description="finished a turn (or has news) since the owner last looked, or marked unread"
    )
    finished_at: datetime | None = Field(default=None, description="when it last finished a turn")
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


class MarkRead(BaseModel):
    read: bool = Field(default=True, description="false marks it unread, to come back to")


class UpdateSession(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    auto_approve: bool | None = None


class ConversationItemKind(StrEnum):
    PROMPT = "prompt"  # what the owner (or another controller) sent
    REPLY = "reply"  # the agent's prose
    TOOL = "tool"  # a tool call, with a one-line detail
    APPROVAL = "approval"  # a permission prompt and how it ended
    QUESTION = "question"  # a question to the owner and how it ended
    RESULT = "result"  # the end of a turn


class ItemStatus(StrEnum):
    RUNNING = "running"  # tool
    DONE = "done"  # tool, result
    ERROR = "error"  # tool, result
    PENDING = "pending"  # approval, question
    ALLOWED = "allowed"  # approval
    DENIED = "denied"  # approval
    ANSWERED = "answered"  # question
    DISMISSED = "dismissed"  # question
    CANCELLED = "cancelled"  # approval, question: withdrawn by the agent


class ConversationItem(BaseModel):
    """One normalized entry of a session's conversation. `seq` orders items; an item can be sent again
    with the same `seq` when its status changes (a tool finishing, a prompt being answered)."""

    seq: int
    at: datetime | None = None
    kind: ConversationItemKind
    text: str | None = None
    tool_name: str | None = None
    status: ItemStatus | None = None


class Conversation(BaseModel):
    session_id: str
    items: list[ConversationItem]
    latest_seq: int
