"""Live (in-memory) state per session and the rule that merges hook events with screen rules.

Hooks are precise but only say what happened; the screen says what is true now. A hook's attention
state wins until the screen proves it is over: the agent is visibly busy again, or no dialog has been
on screen for STALE_HOOK_SECONDS (e.g. the user answered at the keyboard and no later hook fired)."""

import json
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime

from muxtower.runtimes.models import APPROVABLE_STATES, ATTENTION_STATES, AgentState, Option
from muxtower.runtimes.spec import Classification
from muxtower.sessions.models import PendingAction, StateSource

STALE_HOOK_SECONDS = 10.0


@dataclass
class HookState:
    state: AgentState
    at: float  # monotonic
    tool_name: str | None = None
    detail: str | None = None
    last_message: str | None = None

    def dump(self) -> str:
        """JSON for storage; the monotonic time is stored as an age so it survives a restart."""
        age = time.monotonic() - self.at
        data = {"state": self.state.value, "age": age, "tool_name": self.tool_name, "detail": self.detail,
                "last_message": self.last_message}  # fmt: skip
        return json.dumps(data, ensure_ascii=False)

    @classmethod
    def load(cls, raw: str) -> "HookState":
        data = json.loads(raw)
        return cls(
            state=AgentState(data["state"]),
            at=time.monotonic() - float(data.get("age", 0)),
            tool_name=data.get("tool_name"),
            detail=data.get("detail"),
            last_message=data.get("last_message"),
        )


@dataclass
class ScreenState:
    classification: Classification
    text: str
    since: float  # monotonic time the classified state was first seen
    ansi: str | None = None


@dataclass
class Effective:
    state: AgentState
    source: StateSource
    matched_rule: str | None
    pending: PendingAction | None


@dataclass
class LiveSession:
    hook: HookState | None = None
    screen: ScreenState | None = None
    last_message: str | None = None
    effective: Effective | None = None
    remote_id: str | None = None  # the same agent's Remote Control session (see claude_processes.py)
    transcript: str | None = None  # its Claude Code transcript file, when it has one
    alt_screen: bool = False  # draws full screen: tmux keeps no scrollback for it
    attached: bool = False  # a terminal is attached to its tmux session
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))


def merge(hook: HookState | None, screen: ScreenState | None, now: float) -> Effective:
    screen_state = screen.classification.state if screen else AgentState.UNKNOWN
    options: list[Option] = screen.classification.options if screen else []
    rule = screen.classification.rule if screen else None

    if hook is not None and hook.state in ATTENTION_STATES:
        cleared = screen is not None and (
            (screen_state == AgentState.BUSY and screen.since > hook.at)
            or (screen_state not in APPROVABLE_STATES and now - max(hook.at, screen.since) > STALE_HOOK_SECONDS)
        )
        if not cleared:
            pending = PendingAction(
                state=hook.state,
                tool_name=hook.tool_name,
                detail=hook.detail,
                options=options if screen_state in APPROVABLE_STATES else [],
            )
            return Effective(hook.state, StateSource.HOOK, rule, pending)

    if screen is not None and screen_state in ATTENTION_STATES:
        pending = PendingAction(state=screen_state, options=options)
        return Effective(screen_state, StateSource.SCREEN, rule, pending)

    if screen is not None and rule is not None:
        return Effective(screen_state, StateSource.SCREEN, rule, None)
    if hook is not None and hook.state not in ATTENTION_STATES:
        return Effective(hook.state, StateSource.HOOK, None, None)
    return Effective(screen_state, StateSource.DEFAULT, None, None)
