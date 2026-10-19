"""Claude Code Remote Control sessions as muxtower sessions.

Every poll lists the account's active sessions. A session whose fingerprint (last event, worker and
bucket status, unread, title) changed gets its new events and details fetched; its conversation is
built from the structured event log, so nothing is read off a screen. State comes from the worker's
own status and the unanswered permission prompt in the log.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from muxtower.errors import Conflict, Invalid, NotFound
from muxtower.infra.bus import EventBus
from muxtower.runtimes.models import ATTENTION_STATES, AgentState, Option
from muxtower.sessions.models import (
    Capabilities,
    Conversation,
    ConversationItem,
    PendingAction,
    Session,
    StateSource,
    TurnSummary,
)
from muxtower.sessions.ports import SessionSource
from muxtower.sources.remote_control.conversation import ConversationBuilder, PendingRequest
from muxtower.sources.remote_control.ports import RemoteControlPort

logger = logging.getLogger("muxtower.remote_control")

FIRST_LOAD_EVENTS = 150
EVENTS_PER_POLL = 200
MAX_PAGES = 4
DENY_MESSAGE = "Denied from muxtower."
CAPABILITIES = Capabilities(screen=False, conversation=True, keys=["Escape"], resize=False, terminate=False)


def _when(value: Any) -> datetime:
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            pass
    return datetime.now(UTC)


def _flag(value: Any) -> bool:
    return value is True or (isinstance(value, str) and value.lower() == "true")


@dataclass
class RcSession:
    raw: dict[str, Any]
    builder: ConversationBuilder = field(default_factory=ConversationBuilder)
    detail: dict[str, Any] = field(default_factory=dict)
    fingerprint: tuple[Any, ...] = ()
    view: Session | None = None


@dataclass
class RcTick:
    changed: bool = False
    attention: list[str] = field(default_factory=list)
    conversation: dict[str, list[ConversationItem]] = field(default_factory=dict)


class RemoteControlSource:
    def __init__(self, port: RemoteControlPort, environments: dict[str, str]) -> None:
        self.port = port
        self.environments = environments
        self.sessions: dict[str, RcSession] = {}

    # --- reading ------------------------------------------------------------------------------

    def owns(self, session_id: str) -> bool:
        return session_id in self.sessions

    def views(self) -> list[Session]:
        return [s.view for s in self.sessions.values() if s.view is not None]

    def _session(self, session_id: str) -> RcSession:
        found = self.sessions.get(session_id)
        if found is None or found.view is None:
            raise NotFound(f"unknown session {session_id}")
        return found

    def get(self, session_id: str) -> Session:
        view = self._session(session_id).view
        assert view is not None
        return view

    def conversation(self, session_id: str, after: int, limit: int) -> Conversation:
        rc = self._session(session_id)
        items = rc.builder.after(after, limit)
        latest = max(rc.builder.items, default=0)
        return Conversation(session_id=session_id, items=items, latest_seq=latest)

    # --- view ---------------------------------------------------------------------------------

    def _machine(self, raw: dict[str, Any]) -> str | None:
        env_id = raw.get("environment_id")
        if env_id and env_id in self.environments:
            return self.environments[env_id]
        if raw.get("environment_kind") == "anthropic_cloud":
            return "cloud"
        return f"env {str(env_id)[-6:]}" if env_id else None

    @staticmethod
    def _pending(rc: RcSession) -> PendingAction | None:
        request = rc.builder.pending
        if request is None or rc.raw.get("worker_status") != "requires_action":
            return None
        if request.is_question:
            questions = request.tool_input.get("questions") or []
            first = questions[0] if questions and isinstance(questions[0], dict) else {}
            labels = [str(o.get("label")) for o in first.get("options") or [] if isinstance(o, dict)]
            return PendingAction(
                state=AgentState.NEEDS_ANSWER,
                tool_name=request.tool_name,
                detail=str(first.get("question") or "") or None,
                options=[Option(key=str(i), label=label) for i, label in enumerate(labels, 1)],
            )
        state = AgentState.PLAN_REVIEW if request.tool_name == "ExitPlanMode" else AgentState.NEEDS_PERMISSION
        items = rc.builder.items.get(request.item_seq)
        return PendingAction(
            state=state,
            tool_name=request.tool_name,
            detail=items.text if items else None,
            options=[Option(key="allow", label="Yes"), Option(key="deny", label="No")],
            recommended="allow",
        )

    def _view(self, rc: RcSession) -> Session:
        raw, detail = rc.raw, rc.detail
        pending = self._pending(rc)
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
        return Session(
            id=str(raw["id"]),
            name=str(title)[:80],
            runtime="claude-code",
            cwd="",
            source=SessionSource.REMOTE_CONTROL,
            machine=self._machine(raw),
            origin=(raw.get("config") or {}).get("origin"),
            capabilities=CAPABILITIES,
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

    # --- polling ------------------------------------------------------------------------------

    def _active(self) -> list[dict[str, Any]]:
        """Active sessions, newest first; stops paging at the first page with none."""
        found: list[dict[str, Any]] = []
        cursor: str | None = None
        for _ in range(MAX_PAGES):
            page, cursor = self.port.list_sessions(cursor)
            active = [s for s in page if s.get("status") == "active" and s.get("id")]
            found += active
            if not active or not cursor:
                break
        return found

    def tick(self) -> RcTick:
        """Blocking (HTTP); run from a worker thread."""
        result = RcTick()
        alive: set[str] = set()
        for raw in self._active():
            session_id = str(raw["id"])
            alive.add(session_id)
            fingerprint = tuple(
                raw.get(k) for k in ("last_event_at", "worker_status", "status_bucket", "unread", "title")
            )
            rc = self.sessions.get(session_id)
            if rc is not None and rc.fingerprint == fingerprint:
                continue
            if rc is None:
                rc = self.sessions[session_id] = RcSession(raw=raw)
                events = self.port.recent_events(session_id, FIRST_LOAD_EVENTS)
            else:
                rc.raw = raw
                events = self.port.events_after(session_id, rc.builder.latest_event_seq, EVENTS_PER_POLL)
            new_items = rc.builder.feed(events)
            rc.detail = self.port.get_session(session_id)
            rc.fingerprint = fingerprint
            before = rc.view
            rc.view = self._view(rc)
            result.changed = True
            if new_items:
                result.conversation[session_id] = new_items
            entered = rc.view.needs_attention and (before is None or before.state != rc.view.state)
            if entered and before is not None:  # not on first sight: no alerts for old prompts at startup
                result.attention.append(session_id)
        for gone in set(self.sessions) - alive:
            del self.sessions[gone]
            result.changed = True
        return result

    async def run_loop(self, bus: EventBus, interval: float) -> None:
        logger.info("Remote Control source polling every %ss", interval)
        while True:
            try:
                result = await asyncio.wait_for(asyncio.to_thread(self.tick), timeout=60)
            except TimeoutError:
                logger.warning("Remote Control poll timed out")
            except Exception:
                logger.exception("Remote Control poll failed")
            else:
                if result.changed:
                    bus.publish("sessions", None)
                for session_id, items in result.conversation.items():
                    bus.publish(f"conversation:{session_id}", items)
                for session_id in result.attention:
                    bus.publish(f"attention:{session_id}", None)
            await asyncio.sleep(interval)

    # --- actions ------------------------------------------------------------------------------

    def _request(self, session_id: str) -> PendingRequest:
        rc = self._session(session_id)
        request = rc.builder.pending
        if request is None or rc.raw.get("worker_status") != "requires_action":
            raise Conflict("nothing to answer: the session is not waiting on a prompt")
        return request

    def approve(self, session_id: str, option: str | None) -> tuple[AgentState, str]:
        request = self._request(session_id)
        view = self.get(session_id)
        if request.is_question:
            pending = view.pending
            options = {o.key: o.label for o in (pending.options if pending else [])}
            if option not in options:
                raise Invalid("pick one of the offered answers")
            questions = request.tool_input.get("questions") or []
            question = str((questions[0] or {}).get("question") or "") if questions else ""
            self.port.answer_question(
                session_id, request.request_id, {question: options[option]},
                tool_input=request.tool_input, tool_use_id=request.tool_use_id,
            )  # fmt: skip
            return view.state, option
        if option not in (None, "allow", "deny"):
            raise Invalid("option must be allow or deny")
        allow = option != "deny"
        self.port.respond_permission(
            session_id, request.request_id, allow=allow, tool_input=request.tool_input,
            tool_use_id=request.tool_use_id, message=None if allow else DENY_MESSAGE,
        )  # fmt: skip
        return view.state, "allow" if allow else "deny"

    def deny(self, session_id: str) -> AgentState:
        request = self._request(session_id)
        state = self.get(session_id).state
        if request.is_question:
            self.port.answer_question(
                session_id, request.request_id, {}, tool_input=request.tool_input, tool_use_id=request.tool_use_id
            )
        else:
            self.port.respond_permission(
                session_id, request.request_id, allow=False, tool_input=request.tool_input,
                tool_use_id=request.tool_use_id, message=DENY_MESSAGE,
            )  # fmt: skip
        return state

    def send_text(self, session_id: str, text: str) -> None:
        self._session(session_id)
        self.port.send_message(session_id, text)

    def send_key(self, session_id: str, key: str) -> None:
        self._session(session_id)
        if key != "Escape":
            raise Conflict("this session only takes Escape (interrupt) as a key")
        self.port.interrupt(session_id)
