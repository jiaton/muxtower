from datetime import UTC, datetime
from typing import Any

from muxtower.notify.text import attention_text, done_text, one_line
from muxtower.runtimes.models import AgentState
from muxtower.sessions.models import Capabilities, PendingAction, Session, StateSource, TurnSummary
from muxtower.sessions.ports import SessionSource

CAPS = Capabilities(screen=True, conversation=False, keys=[], resize=False, terminate=False, rename=False)


def session(**over: Any) -> Session:
    now = datetime.now(UTC)
    base: dict[str, Any] = dict(
        id="s1", name="web", runtime="claude-code", cwd="/home/me/projects/web", machine="hub",
        source=SessionSource.ADOPTED, capabilities=CAPS, state=AgentState.IDLE,
        state_source=StateSource.HOOK, matched_rule=None, needs_attention=False, pending=None, last_message=None,
        auto_approve=False, can_auto_approve=False, created_at=now, updated_at=now,
    )  # fmt: skip
    return Session(**{**base, **over})


def test_attention_names_the_session_then_what_it_wants_then_where() -> None:
    asks = session(
        state=AgentState.NEEDS_PERMISSION, needs_attention=True,
        pending=PendingAction(state=AgentState.NEEDS_PERMISSION, tool_name="Bash", detail="npm run build"),
    )  # fmt: skip
    assert attention_text(asks) == ("web", "Approve Bash: npm run build\nhub · ~/projects/web")
    plan = session(state=AgentState.PLAN_REVIEW, needs_attention=True, machine=None, cwd="")
    assert attention_text(plan) == ("web", "Plan ready for review")


def test_done_prefers_what_it_left_for_you_then_what_it_did() -> None:
    waiting = session(summary=TurnSummary(needs="Sign the form", detail="3 sent"))
    assert done_text(waiting)[1].startswith("Done, waiting for you: Sign the form")
    assert done_text(session(last_message="## Result\n\n**All** tests pass"))[1].startswith(
        "Done: Result All tests pass"
    )
    assert done_text(session())[1].startswith("Finished its turn")


def test_long_folders_keep_their_last_parts() -> None:
    deep = session(cwd="/home/me/work/clients/acme/services/billing-api")
    assert attention_text(deep)[1] == "Needs you\nhub · …/services/billing-api"


def test_one_line_flattens_and_cuts() -> None:
    assert one_line("a\n\n- b  `c`", limit=20) == "a b c"
    assert one_line("x" * 30, limit=10) == "x" * 9 + "…"
