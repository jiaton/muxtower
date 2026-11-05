"""What a dialog asks about, read off the screen (`[context]` in a runtime's TOML) for whoever approves it
away from it: only from the dialog's own lines, and never where a hook already said."""

import time

from muxtower.runtimes.models import AgentState, Option
from muxtower.runtimes.spec import Classification, Menu, load_runtimes
from muxtower.sessions.live import HookState, ScreenState, merge
from tests import screens


def runtime(name: str = "claude-code"):  # type: ignore[no-untyped-def]
    return load_runtimes(None)[name]


def test_a_permission_dialog_gives_its_tool_and_command() -> None:
    c = runtime().classify(screens.PERMISSION)
    assert (c.tool_name, c.detail) == ("Bash", "rm -rf build/\nRemove the build directory")


def test_trust_dialogs_give_what_they_ask_about() -> None:
    rt = runtime()
    assert rt.classify(screens.MCP_TRUST).detail == "New MCP server found in .mcp.json: docs"
    assert rt.classify(screens.BYPASS_CONFIRM).detail == "WARNING: Claude Code running in Bypass Permissions mode"
    assert rt.classify(screens.TRUST).detail == "/work/project"
    assert rt.classify(screens.MCP_TRUST).tool_name is None


def test_codex_dialogs_give_the_command_or_the_reason() -> None:
    codex = runtime("codex")
    assert codex.classify(screens.CODEX_COMMAND).detail == "$ echo hello world"
    assert codex.classify(screens.CODEX_EDITS).detail == "Reason: The model wants to apply changes"


def test_a_dialog_quoted_in_the_conversation_gives_nothing() -> None:
    rt = runtime()
    for screen in (screens.BUSY_QUOTING_DIALOG, screens.IDLE_QUOTING_DIALOG):
        c = rt.classify(screen)
        assert (c.tool_name, c.detail) == (None, None)


def test_an_older_call_above_the_dialog_is_not_its_tool() -> None:
    older = "● Read(src/app.ts)\n  ⎿  Read 40 lines\n────────\n● Done reading.\n\n"
    c = runtime().classify(older + screens.PERMISSION)
    assert c.tool_name == "Bash"
    assert runtime().classify(older + screens.MCP_TRUST).tool_name is None


def test_a_long_detail_is_cut() -> None:
    long = screens.PERMISSION.replace("   rm -rf build/", "   echo " + "x" * 2000)
    detail = runtime().classify(long).detail
    assert detail is not None and len(detail) == 500 and detail.endswith("…")


def test_context_patterns_read_a_big_screen_in_linear_time() -> None:
    """Like the rules: each is tried on a dialog's lines every second while it shows."""
    for rt in load_runtimes(None).values():
        patterns = ([rt.context_tool] if rt.context_tool else []) + rt.context_detail
        for pattern in patterns:
            for screen in (screens.LONG_IDLE, screens.LONG_IDLE.replace("● Read", "────────\n● Read(x)")):
                took = []
                for _ in range(3):
                    started = time.perf_counter()
                    list(pattern.finditer(screen))
                    took.append(time.perf_counter() - started)
                assert min(took) < 0.005, f"{rt.name}:{pattern.pattern} took {min(took) * 1000:.1f} ms"


def _screen(c: Classification) -> ScreenState:
    return ScreenState(c, "", 5)


def test_the_screen_s_context_fills_a_pending_no_hook_described() -> None:
    options = [Option(key="1", label="Yes")]
    c = Classification(AgentState.NEEDS_PERMISSION, "r", Menu(options, 0), tool_name="Bash", detail="rm -rf build/")
    eff = merge(None, _screen(c), now=6)
    assert eff.pending and (eff.pending.tool_name, eff.pending.detail) == ("Bash", "rm -rf build/")
    hook = HookState(AgentState.NEEDS_PERMISSION, at=5.5, tool_name="Edit", detail="src/app.ts")
    eff = merge(hook, _screen(c), now=6)
    assert eff.pending and (eff.pending.tool_name, eff.pending.detail) == ("Edit", "src/app.ts")


def test_a_finished_call_with_a_reply_after_it_is_not_the_dialog_s_tool() -> None:
    before = "● Read(src/app.ts)\n  ⎿  Read 40 lines\n● Done reading.\n\n"
    assert runtime().classify(before + screens.MCP_TRUST).tool_name is None
