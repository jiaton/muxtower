from datetime import UTC, datetime

from muxtower.runtimes.models import AgentState
from muxtower.sessions.models import Capabilities, Session, StateSource
from muxtower.sessions.ports import SessionSource
from muxtower.sessions.turns import MIN_BUSY_SECONDS, SETTLE_SECONDS, TurnWatcher

CAPS = Capabilities(screen=True, conversation=False, keys=[], resize=False, terminate=False, rename=False)


def at(state: AgentState, sid: str = "s1") -> Session:
    now = datetime.now(UTC)
    return Session(
        id=sid, name=sid, runtime="claude-code", cwd="/w", source=SessionSource.ADOPTED, capabilities=CAPS,
        state=state, state_source=StateSource.HOOK, matched_rule=None, needs_attention=state == AgentState.NEEDS_ANSWER,
        pending=None, last_message=None, auto_approve=False, can_auto_approve=False, created_at=now, updated_at=now,
    )  # fmt: skip


def run(watcher: TurnWatcher, steps: list[tuple[float, AgentState]]) -> list[float]:
    """When (at which step time) a finished turn was announced."""
    return [t for t, state in steps if watcher.observe([at(state)], t)]


def test_a_turn_finishes_once_after_settling() -> None:
    busy, idle = AgentState.BUSY, AgentState.IDLE
    first = SETTLE_SECONDS + 20
    steps = [(0.0, idle), (1.0, busy), (20.0, idle), (25.0, idle), (first, idle), (first + 10, idle)]
    assert run(TurnWatcher(), steps) == [first]


def test_flicker_short_turns_and_questions_do_not_count() -> None:
    busy, idle, asks = AgentState.BUSY, AgentState.IDLE, AgentState.NEEDS_ANSWER
    late = 100 + SETTLE_SECONDS
    # a moment of idle inside a long turn, then it goes on: announced once, at the real end
    assert run(
        TurnWatcher(), [(0, idle), (1, busy), (10, idle), (12, busy), (60, idle), (60 + SETTLE_SECONDS, idle)]
    ) == [60 + SETTLE_SECONDS]
    # too short to be a task
    assert run(TurnWatcher(), [(0, idle), (1, busy), (1 + MIN_BUSY_SECONDS / 2, idle), (late, idle)]) == []
    # stops to ask: the attention alert covers it
    assert run(TurnWatcher(), [(0, idle), (1, busy), (30, asks), (40, idle), (late, idle)]) == []


def test_sessions_seen_at_startup_are_only_learned() -> None:
    watcher = TurnWatcher()
    assert watcher.observe([at(AgentState.IDLE, "a"), at(AgentState.IDLE, "b")], 0) == []
    assert watcher.observe([at(AgentState.IDLE, "a")], 100) == []
