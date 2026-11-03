from pathlib import Path

from muxtower.runtimes.models import AgentState
from muxtower.runtimes.spec import load_runtimes
from tests import screens


def claude():  # type: ignore[no-untyped-def]
    return load_runtimes(None)["claude-code"]


def test_default_rules_classify_known_screens() -> None:
    rt = claude()
    assert rt.classify(screens.PERMISSION).state == AgentState.NEEDS_PERMISSION
    assert rt.classify(screens.QUESTION).state == AgentState.NEEDS_ANSWER
    assert rt.classify(screens.PLAN).state == AgentState.PLAN_REVIEW
    assert rt.classify(screens.BUSY).state == AgentState.BUSY
    idle = rt.classify(screens.IDLE)
    assert idle.state == AgentState.IDLE and idle.rule is None


def test_working_is_read_at_the_bottom_not_in_the_conversation() -> None:
    rt = claude()
    assert rt.classify(screens.WORKING_NARROW).state == AgentState.BUSY  # the hint cut short
    assert rt.classify(screens.WORKING_NARROW.replace("✢ Misting…", "✻ Worked")).state == AgentState.BUSY
    assert rt.classify(screens.DONE_QUOTING).state == AgentState.IDLE
    codex = load_runtimes(None)["codex"]
    quoted = "Codex says esc to interrupt while it works.\n" + "\n".join(f"line {n}" for n in range(45))
    assert codex.classify(quoted + "\n" + screens.CODEX_IDLE).state == AgentState.IDLE


def test_options_are_parsed_and_broader_approval_preferred() -> None:
    rt = claude()
    result = rt.classify(screens.PERMISSION)
    assert [o.key for o in result.options] == ["1", "2", "3"]
    assert rt.choose_option(AgentState.NEEDS_PERMISSION, result.options) == "2"
    assert rt.choose_option(AgentState.PLAN_REVIEW, rt.classify(screens.PLAN).options) == "1"
    assert rt.choose_option(AgentState.NEEDS_ANSWER, rt.classify(screens.QUESTION).options) is None
    tip = rt.classify(screens.AUTO_MODE_TIP)
    assert tip.options[0].label == "Yes" and rt.choose_option(tip.state, tip.options) is None


def test_generic_dialog_is_a_question_not_trust_and_prompt_is_not_a_menu() -> None:
    result = claude().classify(screens.AUTO_MODE_TIP)
    assert result.state == AgentState.NEEDS_ANSWER and result.rule == "choice-dialog"
    assert [o.label for o in result.options] == ["Yes", "Not now", "Don't show again"]
    assert claude().parse_menu(screens.IDLE) is None


def test_unnumbered_menu_is_navigated_with_arrows() -> None:
    rt = claude()
    result = rt.classify(screens.TRUST)
    assert result.state == AgentState.NEEDS_TRUST
    assert [o.label for o in result.options] == ["No, exit", "Yes, I trust this folder"]
    assert result.menu and result.menu.cursor == 0
    key = rt.choose_option(result.state, result.options)
    assert key == "2"
    assert [s.key for s in rt.select_steps(result.menu, key)] == ["Down", "Enter"]


def test_wrapped_labels_and_custom_cursor(tmp_path: Path) -> None:
    (tmp_path / "x.toml").write_text('name = "x"\nbinary = "x"\n[menu]\ncursor = ">"\n')
    rt = load_runtimes(tmp_path)["x"]
    menu = rt.parse_menu("Pick one\n    first\n  > second choice that is long\n      and wraps here\n    third\n")
    assert menu and [o.label for o in menu.options] == ["first", "second choice that is long and wraps here", "third"]
    assert menu.cursor == 1


def test_mid_word_wrap_at_full_width_is_joined_without_a_space() -> None:
    width = 35
    screen = (
        "─" * width + "\n"  # the separator spans the screen width
        " ❯ 1. Yes\n"
        "   2. Yes, and always allow access to\n"
        "      /tmp/a-very-long-path/that-is\n"  # one token, exactly full width: split mid-word
        "      -longer-than-a-line from here\n"
        "   3. Yes, and switch to auto\n"
        "      mode for these\n"
        "   4. No\n"
    )
    menu = claude().parse_menu(screen)
    assert menu and [o.label for o in menu.options] == [
        "Yes",
        "Yes, and always allow access to /tmp/a-very-long-path/that-is-longer-than-a-line from here",
        "Yes, and switch to auto mode for these",
        "No",
    ]


def test_full_width_line_that_ends_on_a_word_keeps_the_space() -> None:
    screen = "─" * 36 + "\n ❯ 1. Yes\n   2. Yes, and switch to auto mode ·\n      auto mode handles these\n   3. No\n"
    menu = claude().parse_menu(screen)
    assert menu and menu.options[1].label == "Yes, and switch to auto mode · auto mode handles these"


def test_user_file_replaces_builtin_and_bad_file_is_ignored(tmp_path: Path) -> None:
    (tmp_path / "claude-code.toml").write_text(
        'name = "claude-code"\nbinary = "claude"\n[[rules]]\nname = "custom"\nstate = "busy"\npattern = "WORKING"\n'
    )
    (tmp_path / "broken.toml").write_text(
        'name = "broken"\nbinary = "x"\n[[rules]]\nname="r"\nstate="busy"\npattern="("\n'
    )
    runtimes = load_runtimes(tmp_path)
    assert "broken" not in runtimes
    rt = runtimes["claude-code"]
    assert rt.source == "user:claude-code.toml"
    assert rt.classify("WORKING").rule == "custom"
    assert rt.classify(screens.PERMISSION).state == AgentState.UNKNOWN  # builtin rules are gone


def test_new_runtime_can_be_added(tmp_path: Path) -> None:
    (tmp_path / "aider.toml").write_text('name = "aider"\nbinary = "aider"\n')
    assert "aider" in load_runtimes(tmp_path)


def test_codex_dialogs_are_classified_and_approved_once() -> None:
    rt = load_runtimes(None)["codex"]
    command = rt.classify(screens.CODEX_COMMAND)
    assert command.state == AgentState.NEEDS_PERMISSION and [o.key for o in command.options] == ["1", "2", "3"]
    assert rt.choose_option(command.state, command.options) == "1"  # not "don't ask again"
    assert rt.classify(screens.CODEX_EDITS).state == AgentState.NEEDS_PERMISSION
    question = rt.classify(screens.CODEX_QUESTION)
    assert question.state == AgentState.NEEDS_ANSWER and rt.choose_option(question.state, question.options) is None
    assert rt.classify(screens.CODEX_WORKING).state == AgentState.BUSY
    assert rt.classify(screens.CODEX_IDLE).state == AgentState.IDLE
    trust = rt.classify(screens.CODEX_TRUST)
    assert trust.state == AgentState.NEEDS_TRUST and rt.choose_option(trust.state, trust.options) == "1"


def test_codex_plan_error_and_interrupt_screens() -> None:
    rt = load_runtimes(None)["codex"]
    plan = rt.classify(screens.CODEX_PLAN)
    assert plan.state == AgentState.PLAN_REVIEW and [o.key for o in plan.options] == ["1", "2", "3"]
    assert rt.choose_option(plan.state, plan.options) == "1"  # not "clear context and implement"
    assert rt.classify(screens.CODEX_ERROR).state == AgentState.ERROR
    assert rt.classify(screens.CODEX_INTERRUPTED).state == AgentState.IDLE  # interrupting is not failing
    older = screens.CODEX_ERROR.replace(
        "› Ask Codex", "\n".join(f"  later line {n}" for n in range(8)) + "\n› Ask Codex"
    )
    assert rt.classify(older).state == AgentState.IDLE  # a failure scrolled up does not hold the session
    assert rt.classify(screens.CODEX_ERROR + "\n• Working (3s • esc to interrupt)").state == AgentState.BUSY
    assert set(rt.config.auto_approve_states) == {AgentState.NEEDS_PERMISSION, AgentState.NEEDS_TRUST}


def test_codex_permission_tool_and_rate_limit_dialogs() -> None:
    rt = load_runtimes(None)["codex"]
    permissions = rt.classify(screens.CODEX_PERMISSIONS)
    assert permissions.state == AgentState.NEEDS_PERMISSION
    assert rt.choose_option(permissions.state, permissions.options) == "1"  # for this turn, not the session
    tool = rt.classify(screens.CODEX_APP_TOOL)
    assert tool.state == AgentState.NEEDS_PERMISSION
    assert rt.choose_option(tool.state, tool.options) == "1"  # run it once, not "remember"
    limit = rt.classify(screens.CODEX_RATE_LIMIT)
    assert limit.state == AgentState.NEEDS_ANSWER and rt.choose_option(limit.state, limit.options) is None


def test_trust_dialogs_are_found_below_a_long_conversation() -> None:
    rt = claude()
    for screen in (screens.TRUST, screens.MCP_TRUST):
        assert rt.classify(screens.LONG_IDLE + screen).state == AgentState.NEEDS_TRUST


def test_every_default_rule_reads_a_big_screen_in_linear_time() -> None:
    """Each pane is classified every second: a rule that backtracks over the whole screen from every position
    (an unanchored lookahead with DOTALL) took 40-115 ms on 10 000 characters and kept a core busy."""
    import time

    for runtime in load_runtimes(None).values():
        for rule, pattern in runtime.rules:
            took = []
            for _ in range(3):
                started = time.perf_counter()
                pattern.search(screens.LONG_IDLE)
                took.append(time.perf_counter() - started)
            assert min(took) < 0.005, f"{runtime.name}:{rule.name} took {min(took) * 1000:.1f} ms"


def test_an_unanchored_lookahead_is_refused(tmp_path: Path) -> None:
    (tmp_path / "slow.toml").write_text(
        'name = "slow"\nbinary = "slow"\n[[rules]]\nname = "x"\nstate = "needs_trust"\npattern = \'(?=.*a)(?=.*b)\'\n'
    )
    assert "slow" not in load_runtimes(tmp_path)  # logged and left out, like any broken file
