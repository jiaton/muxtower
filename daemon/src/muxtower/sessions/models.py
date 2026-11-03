"""API schemas for sessions (what clients see)."""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field, model_validator

from muxtower.runtimes.models import AgentState, Option, PendingQuestion
from muxtower.sessions.images import shown_images
from muxtower.sessions.ports import SessionSource


class StateSource(StrEnum):
    HOOK = "hook"  # structured event from the agent
    SCREEN = "screen"  # a screen rule matched
    DEFAULT = "default"  # nothing matched; the runtime's default state
    REMOTE = "remote"  # reported by the agent's own controller protocol (Remote Control)


class NotifyLevel(StrEnum):
    """Which push notifications a session sends, as the owner set it."""

    ALL = "all"  # when it needs the owner, and when it finishes a turn
    NEEDS = "needs"  # when it needs the owner: a prompt, or a finished turn whose summary asks for them
    OFF = "off"  # none


class PendingAction(BaseModel):
    """What the agent is waiting for. tool_name/detail come from hooks; options from the screen."""

    state: AgentState
    tool_name: str | None = None
    detail: str | None = None
    options: list[Option] = Field(default_factory=list)
    recommended: str | None = Field(default=None, description="option key approve picks when none is given")
    questions: list[PendingQuestion] = Field(
        default_factory=list,
        description="a multiple-choice prompt's questions, when known: answer them all at once with `answers`",
    )


class Placement(BaseModel):
    """Where the owner says a session runs, over what its source reports; empty fields are not placed."""

    machine: str | None = Field(default=None, max_length=80, description="a machine, as the lists name it")
    folder: str | None = Field(default=None, max_length=500, description="a folder: a path, ~ for home")


class DetectedFolder(BaseModel):
    folder: str | None = Field(description="the folder its log names, to place it there; null when none")


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
    terminate: bool = Field(description="it can be stopped (DELETE); for an archived one: deleted from the archive")
    rename: bool
    archive: bool = Field(default=False, description="it can be archived: ended, and kept to read (POST /archive)")
    place: bool = Field(
        default=False, description="where it runs can be set by the owner or detected from its log (/placement)"
    )
    images: bool = Field(default=False, description="a message to it may carry images (SendInput.images)")


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
    terminal_attached: bool = Field(
        default=False,
        description="a terminal is attached to its tmux session, so someone may be watching it at its own size",
    )
    role: SessionRole | None = None
    remote_id: str | None = Field(
        default=None,
        description="the controller session of this agent (Claude Code's Remote Control session, a Codex thread "
        "of the shared app-server), when it has one; listed once, under this id",
    )
    summary: TurnSummary | None = None
    reply_summary: str | None = Field(
        default=None, description="a few lines condensing last_message, once the hub has made them (long replies)"
    )
    unread: bool = Field(
        default=False, description="finished a turn (or has news) since the owner last looked, or marked unread"
    )
    finished_at: datetime | None = Field(default=None, description="when it last finished a turn")
    hidden: bool = Field(default=False, description="the owner hid it: kept out of the lists and done notifications")
    pinned: bool = Field(default=False, description="the owner pinned it: listed above the others")
    notify: NotifyLevel = Field(default=NotifyLevel.ALL, description="which push notifications it sends")
    placement: Placement | None = Field(
        default=None, description="where the owner placed it; `machine` and `cwd` already follow it"
    )
    archived_at: datetime | None = Field(
        default=None, description="when the owner archived it: it no longer runs, its conversation stays readable"
    )
    node: str | None = Field(
        default=None, description="the node (another daemon joined to this one) it is reached through"
    )
    fork_of: str | None = Field(
        default=None, description="the session it was forked from, as listed here (a side chat's too)"
    )
    side_chat: bool = Field(
        default=False, description="something asked on the side of `fork_of` (Claude desktop's side chat)"
    )
    team_role: str | None = Field(default=None, description="what it is for in its team (free text; `teams/`)")
    team_note: str | None = Field(default=None, description="one more line about its team role")
    project: str | None = Field(default=None, description="the team project it belongs to, once one is kept")
    on_host: bool = Field(default=False, description="its agent runs on the daemon that lists it")
    offline: bool = Field(
        default=False, description="its node is not connected: the last known view, read only until it is back"
    )
    account: str | None = Field(
        default=None, description='the account its agent runs as, as far as known (an email, or "API key")'
    )
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
    headless: bool = Field(
        default=False, description="run it without a terminal, where the runtime can (`RuntimeInfo.headless`)"
    )
    node: str | None = Field(default=None, description="start it on this node instead of here (GET /v1/nodes)")


class HideSession(BaseModel):
    hidden: bool = True


class PinSession(BaseModel):
    pinned: bool = True


class SessionNotify(BaseModel):
    level: NotifyLevel


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
    NEXT_STEP = "next_step"  # the agent's closing recap, its question and replies to pick (Claude desktop)


class ItemStatus(StrEnum):
    RUNNING = "running"  # tool
    DONE = "done"  # tool, result
    ERROR = "error"  # tool, result
    PENDING = "pending"  # approval, question, next_step
    ALLOWED = "allowed"  # approval
    DENIED = "denied"  # approval
    ANSWERED = "answered"  # question; next_step: the owner wrote since
    DISMISSED = "dismissed"  # question
    CANCELLED = "cancelled"  # approval, question: withdrawn by the agent


class NextStepAction(BaseModel):
    label: str
    message: str = Field(description="sent as the owner's message when picked")


class ConversationItem(BaseModel):
    """One normalized entry of a session's conversation. `seq` orders items; an item can be sent again
    with the same `seq` when its status changes (a tool finishing, a prompt being answered)."""

    seq: int
    at: datetime | None = None
    kind: ConversationItemKind
    text: str | None = None
    tool_name: str | None = None
    description: str | None = Field(
        default=None, description="a tool call's own one-line account of itself, when the agent gave one"
    )
    status: ItemStatus | None = None
    ask: str | None = Field(default=None, description="next_step: the question its actions answer")
    actions: list[NextStepAction] = Field(
        default_factory=list, description="next_step: replies to pick, each sent as the owner's message"
    )
    images: list[str] = Field(
        default_factory=list,
        description="paths of the images it shows (a file looked at or sent, a path in a message), for "
        "GET /v1/sessions/{id}/image",
    )

    @model_validator(mode="after")
    def _images(self) -> "ConversationItem":
        if not self.images:
            self.images = shown_images(self.kind, self.tool_name, self.text)
        return self


class Conversation(BaseModel):
    session_id: str
    items: list[ConversationItem]
    latest_seq: int
