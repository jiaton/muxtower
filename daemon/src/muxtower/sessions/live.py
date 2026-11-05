"""Live (in-memory) state per session and the rule that merges hook events with screen rules.

Hooks are precise but only say what happened; the screen says what is true now. A hook's attention
state wins until the screen proves it is over: the agent is visibly busy again, or no dialog has been
on screen for STALE_HOOK_SECONDS (e.g. the user answered at the keyboard and no later hook fired). A hook's
"busy" is believed until the screen has shown nothing at work for the runtime's `busy_stale_seconds`."""

import json
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime

from muxtower.runtimes.models import APPROVABLE_STATES, ATTENTION_STATES, AgentState, Option, PendingQuestion
from muxtower.runtimes.spec import Classification
from muxtower.sessions.models import PendingAction, StateSource
from muxtower.sessions.naming import AgentName

STALE_HOOK_SECONDS = 10.0
ERROR_GRACE_SECONDS = 5.0  # a hook this long after the screen showed an error says the agent went on


@dataclass
class HookState:
    state: AgentState
    at: float  # monotonic
    tool_name: str | None = None
    detail: str | None = None
    last_message: str | None = None
    questions: list[PendingQuestion] = field(default_factory=list)  # a multiple-choice prompt's

    def dump(self) -> str:
        """JSON for storage; the monotonic time is stored as an age so it survives a restart."""
        age = time.monotonic() - self.at
        data = {"state": self.state.value, "age": age, "tool_name": self.tool_name, "detail": self.detail,
                "last_message": self.last_message, "questions": [q.model_dump() for q in self.questions]}  # fmt: skip
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
            questions=[PendingQuestion.model_validate(q) for q in data.get("questions") or []],
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
    hook_transcript: str | None = None  # the transcript its hooks last named
    title: str | None = None  # the name its Claude Code goes by, when it has one
    title_origin: AgentName | None = None  # where that name came from, and since when
    alt_screen: bool = False  # draws full screen: tmux keeps no scrollback for it
    attached: bool = False  # a terminal is attached to its tmux session
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))


def _hook_knows_better(hook: HookState | None, screen: ScreenState) -> bool:
    """A dialog (or an error) the screen rules see, when the agent's hooks say otherwise: words a dialog
    uses, quoted on the screen (a reply, a diff), are no dialog. Hooks report the agent's own prompts
    (permission, question, plan), so a hook that said "working" or "done" since that screen showed wins;
    trust dialogs show only at startup, before any hook, so once one came the screen's trust is not
    believed; and an error stands with the Stop that came with it, not against a hook well after it."""
    if hook is None or hook.state in ATTENTION_STATES:
        return False
    state = screen.classification.state
    if state == AgentState.ERROR:  # an error the agent went on from: its Stop comes with it, a later hook after
        return hook.at - screen.since > ERROR_GRACE_SECONDS
    return state == AgentState.NEEDS_TRUST or (state in APPROVABLE_STATES and hook.at >= screen.since)


def merge(hook: HookState | None, screen: ScreenState | None, now: float, busy_stale: float = 0.0) -> Effective:
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
                questions=hook.questions,
            )
            return Effective(hook.state, StateSource.HOOK, rule, pending)

    overruled = screen is not None and _hook_knows_better(hook, screen)
    if screen is not None and screen_state in ATTENTION_STATES and not overruled:
        assert screen is not None
        c = screen.classification
        pending = PendingAction(state=screen_state, tool_name=c.tool_name, detail=c.detail, options=options)
        return Effective(screen_state, StateSource.SCREEN, rule, pending)

    if screen is not None and rule is not None and not overruled:
        return Effective(screen_state, StateSource.SCREEN, rule, None)
    if (
        hook is not None
        and hook.state == AgentState.BUSY
        and busy_stale
        and screen is not None
        and now - max(hook.at, screen.since) > busy_stale
    ):  # no Stop ever came (the turn failed, or the agent died), and the screen has long shown nothing at work
        return Effective(screen_state, StateSource.SCREEN, None, None)
    if hook is not None and hook.state not in ATTENTION_STATES:
        return Effective(hook.state, StateSource.HOOK, None, None)
    return Effective(screen_state, StateSource.DEFAULT, None, None)
