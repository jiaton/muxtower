"""A Remote Control session (listing + details + event log) as a muxtower Session (pure; no I/O)."""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from muxtower.agent_text import questions_of
from muxtower.claude_conversation import ConversationBuilder
from muxtower.runtimes.models import ATTENTION_STATES, AgentState, Option
from muxtower.sessions.endable import CLOUD, ends_when_archived
from muxtower.sessions.models import Capabilities, PendingAction, Session, StateSource, TurnSummary
from muxtower.sessions.ports import SessionSource
from muxtower.sources.remote_control.folder import WorkingFolder
from muxtower.sources.remote_control.lineage import Lineage

KEYS = ["Escape"]  # interrupt; anything else would need a terminal


@dataclass
class RcSession:
    raw: dict[str, Any]  # the session as listed (status, worker_status, title, environment…)
    builder: ConversationBuilder = field(default_factory=ConversationBuilder)
    folder: WorkingFolder = field(default_factory=WorkingFolder)
    detail: dict[str, Any] = field(default_factory=dict)  # GET /sessions/{id} (post_turn_summary…)
    fingerprint: tuple[Any, ...] = ()
    view: Session | None = None
    lineage: Lineage = field(default_factory=Lineage)  # read once, when first seen

    @property
    def waiting(self) -> bool:
        """Claude Code is blocked on a prompt that nobody has answered in the log yet."""
        return self.builder.pending is not None and self.raw.get("worker_status") == "requires_action"


def _when(value: Any) -> datetime:
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            pass
    return datetime.now(UTC)


def _flag(value: Any) -> bool:
    return value is True or (isinstance(value, str) and value.lower() == "true")


def machine(raw: dict[str, Any], environments: dict[str, str]) -> str | None:
    env_id = raw.get("environment_id")
    if env_id and env_id in environments:
        return environments[env_id]
    if raw.get("environment_kind") == "anthropic_cloud":
        return CLOUD
    return f"env {str(env_id)[-6:]}" if env_id else None


# How Claude Code joined Remote Control, from the session's tags. The listing's `origin` says
# claude_code_cli for all of them; the desktop app runs Claude Code through the SDK.
LAUNCHERS = {"remote-control-sdk": "claude_desktop", "remote-control-auto": "claude_code_cli",
             "remote-control-repl": "claude_code_cli"}  # fmt: skip


def origin(raw: dict[str, Any]) -> str | None:
    tags = raw.get("tags")
    tags = tags if isinstance(tags, list) else []
    launcher = next((LAUNCHERS[t] for t in tags if t in LAUNCHERS), None)
    return launcher or (raw.get("config") or {}).get("origin")


def pending_action(rc: RcSession) -> PendingAction | None:
    request = rc.builder.pending
    if request is None or not rc.waiting:
        return None
    if request.is_question:
        labels = [str(o.get("label")) for o in request.question.get("options") or [] if isinstance(o, dict)]
        return PendingAction(
            state=AgentState.NEEDS_ANSWER,
            tool_name=request.tool_name,
            detail=str(request.question.get("question") or "") or None,
            options=[Option(key=str(i), label=label) for i, label in enumerate(labels, 1)],
            questions=questions_of(request.tool_input),
        )
    state = AgentState.PLAN_REVIEW if request.tool_name == "ExitPlanMode" else AgentState.NEEDS_PERMISSION
    item = rc.builder.items.get(request.item_seq)
    return PendingAction(
        state=state,
        tool_name=request.tool_name,
        detail=item.text if item else None,
        options=[Option(key="allow", label="Yes"), Option(key="deny", label="No")],
        recommended="allow",
    )


def to_session(rc: RcSession, environments: dict[str, str]) -> Session:
    raw, detail = rc.raw, rc.detail
    pending = pending_action(rc)
    worker = raw.get("worker_status")
    if pending is not None:
        state = pending.state
    elif worker == "requires_action":
        state = AgentState.NEEDS_PERMISSION
    elif worker == "running":
        state = AgentState.BUSY
    else:
        state = AgentState.IDLE
    raw_turn = detail.get("post_turn_summary")
    turn: dict[str, Any] = raw_turn if isinstance(raw_turn, dict) else {}
    summary = TurnSummary(
        status=turn.get("status_category") or raw.get("status_bucket"),
        detail=turn.get("status_detail") or None,
        recent=turn.get("recent_action") or None,
        needs=turn.get("needs_action") or None,
        noteworthy=_flag(turn.get("is_noteworthy")),
    )
    title = raw.get("title") or detail.get("task_summary") or "Untitled session"
    session = Session(
        id=str(raw["id"]),
        name=str(title)[:80],
        runtime="claude-code",
        cwd=rc.folder.cwd,
        source=SessionSource.REMOTE_CONTROL,
        machine=machine(raw, environments),
        origin=origin(raw),
        capabilities=Capabilities(
            screen=False,
            conversation=True,
            keys=list(KEYS),
            resize=False,
            terminate=False,
            rename=False,
            archive=True,
            place=True,
            images=True,
        ),
        summary=summary,
        unread=bool(raw.get("unread")),
        state=state,
        state_source=StateSource.REMOTE,
        matched_rule=None,
        needs_attention=state in ATTENTION_STATES,
        pending=pending,
        last_message=rc.builder.last_reply,
        auto_approve=False,
        can_auto_approve=False,
        created_at=_when(raw.get("created_at")),
        updated_at=_when(raw.get("last_event_at") or raw.get("updated_at")),
    )
    session.capabilities.archive_ends = ends_when_archived(session)  # in the desktop app: only hidden here
    return session
