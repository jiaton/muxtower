"""One Codex thread as the app-server tells it (pure; no I/O): its state, its conversation, the requests
it waits on, and the muxtower session it shows as."""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from muxtower.runtimes.models import ATTENTION_STATES, AgentState
from muxtower.sessions.models import (
    Capabilities,
    ConversationItem,
    ConversationItemKind,
    ItemStatus,
    Session,
    StateSource,
)
from muxtower.sessions.ports import SessionSource
from muxtower.sources.codex.items import ThreadItems
from muxtower.sources.codex.ports import Message
from muxtower.sources.codex.requests import APPROVALS, QUESTIONS, pending_action

KEYS = ["Escape"]  # interrupts the turn


def _when(value: Any) -> datetime:
    try:
        return datetime.fromtimestamp(float(value), UTC)
    except (TypeError, ValueError):
        return datetime.now(UTC)


@dataclass
class CodexThread:
    raw: dict[str, Any]
    items: ThreadItems = field(default_factory=ThreadItems)
    status: dict[str, Any] = field(default_factory=dict)
    turn_id: str | None = None  # the turn in flight
    requests: dict[str, Message] = field(default_factory=dict)  # waiting on the owner, oldest first
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    @property
    def id(self) -> str:
        return str(self.raw.get("id"))

    def take(self, raw: dict[str, Any], turns: list[Any]) -> None:
        """What a start or resume says about it, with the turns it already has."""
        self.raw = raw
        status = raw.get("status")
        self.status = status if isinstance(status, dict) else {}
        for turn in turns:
            if not isinstance(turn, dict):
                continue
            for item in turn.get("items") or []:
                if isinstance(item, dict):
                    self.items.item(item, completed=True)
            if turn.get("status") == "inProgress":
                self.turn_id = str(turn.get("id"))
            else:
                self.items.turn_ended(turn)


@dataclass
class Applied:
    """What a message changed, for the bus."""

    changed: bool = False
    gone: bool = False
    attention: bool = False
    conversation: list[ConversationItem] = field(default_factory=list)

    def add(self, item: ConversationItem | None) -> None:
        if item is not None:
            self.conversation.append(item)


def apply(thread: CodexThread, message: Message) -> Applied:
    """A message about `thread` from the app-server: a request waiting on the owner, or news."""
    result = Applied(changed=True)
    params, method = message.params, message.method
    thread.updated_at = datetime.now(UTC)
    if message.id is not None and (method in APPROVALS or method in QUESTIONS):
        thread.requests[str(message.id)] = message
        pending = pending_action(thread.requests)
        kind = ConversationItemKind.QUESTION if method in QUESTIONS else ConversationItemKind.APPROVAL
        detail, tool = (pending.detail, pending.tool_name) if pending else (None, None)
        result.add(thread.items.prompt(str(message.id), kind, detail, tool))
        result.attention = True
    elif method == "serverRequest/resolved":
        request_id = str(params.get("requestId"))
        if thread.requests.pop(request_id, None) is not None:  # answered elsewhere, or withdrawn
            result.add(thread.items.resolve(request_id, ItemStatus.CANCELLED))
    elif method == "thread/status/changed" and isinstance(params.get("status"), dict):
        thread.status = params["status"]
    elif method == "turn/started":
        thread.turn_id = str((params.get("turn") or {}).get("id") or "") or None
    elif method == "turn/completed" and isinstance(params.get("turn"), dict):
        thread.turn_id = None
        result.add(thread.items.turn_ended(params["turn"]))
    elif method in ("item/started", "item/completed") and isinstance(params.get("item"), dict):
        result.add(thread.items.item(params["item"], completed=method == "item/completed"))
    elif method == "thread/name/updated":
        thread.raw["name"] = params.get("threadName") or params.get("name")
    elif method in ("thread/archived", "thread/closed"):
        result.gone = True
    else:
        result.changed = False
    return result


def state_of(thread: CodexThread) -> AgentState:
    pending = pending_action(thread.requests)
    if pending:
        return pending.state
    status = thread.status.get("type")
    return {"active": AgentState.BUSY, "systemError": AgentState.ERROR}.get(str(status), AgentState.IDLE)


def to_session(thread: CodexThread) -> Session:
    raw = thread.raw
    state = state_of(thread)
    name = raw.get("name") or str(raw.get("preview") or "").strip().split("\n")[0] or "Codex session"
    return Session(
        id=thread.id,
        name=str(name)[:80],
        runtime="codex",
        cwd=str(raw.get("cwd") or ""),
        source=SessionSource.CODEX,
        origin="codex_app_server",
        capabilities=Capabilities(
            screen=False, conversation=True, keys=KEYS, resize=False, terminate=False, rename=False, archive=True
        ),
        state=state,
        state_source=StateSource.REMOTE,
        matched_rule=None,
        needs_attention=state in ATTENTION_STATES,
        pending=pending_action(thread.requests),
        last_message=thread.items.last_reply,
        auto_approve=False,
        can_auto_approve=False,
        created_at=_when(raw.get("createdAt")),
        updated_at=thread.updated_at,
    )
