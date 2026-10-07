from muxtower.runtimes.models import AgentState, Option
from muxtower.runtimes.spec import Classification, Menu
from muxtower.sessions.live import STALE_HOOK_SECONDS, HookState, ScreenState, merge
from muxtower.sessions.models import StateSource


def screen(state: AgentState, since: float, rule: str | None = "r", options: list[Option] | None = None) -> ScreenState:
    return ScreenState(Classification(state, rule, Menu(options, 0) if options else None), "", since)


def test_hook_attention_wins_and_takes_options_from_screen() -> None:
    hook = HookState(AgentState.NEEDS_PERMISSION, at=10, tool_name="Bash", detail="rm -rf build/")
    eff = merge(hook, screen(AgentState.NEEDS_PERMISSION, 9, options=[Option(key="1", label="Yes")]), now=11)
    assert eff.source == StateSource.HOOK
    assert eff.pending and eff.pending.detail == "rm -rf build/" and eff.pending.options[0].key == "1"


def test_hook_attention_before_dialog_is_drawn() -> None:
    hook = HookState(AgentState.NEEDS_PERMISSION, at=10)
    eff = merge(hook, screen(AgentState.IDLE, 5, rule=None), now=10.5)
    assert eff.state == AgentState.NEEDS_PERMISSION
    assert eff.pending and eff.pending.options == []


def test_busy_screen_after_hook_clears_attention() -> None:
    hook = HookState(AgentState.NEEDS_PERMISSION, at=10)
    assert merge(hook, screen(AgentState.BUSY, 12), now=12).state == AgentState.BUSY


def test_stale_hook_attention_expires() -> None:
    hook = HookState(AgentState.NEEDS_PERMISSION, at=10)
    eff = merge(hook, screen(AgentState.IDLE, 10, rule=None), now=10 + STALE_HOOK_SECONDS + 1)
    assert eff.state == AgentState.IDLE


def test_screen_only_detection_without_hooks() -> None:
    eff = merge(None, screen(AgentState.NEEDS_ANSWER, 1), now=2)
    assert eff.state == AgentState.NEEDS_ANSWER and eff.source == StateSource.SCREEN


def test_hook_idle_beats_default_screen_state() -> None:
    eff = merge(HookState(AgentState.IDLE, at=1), screen(AgentState.IDLE, 1, rule=None), now=2)
    assert eff.source == StateSource.HOOK
