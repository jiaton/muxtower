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


def test_options_are_parsed_and_broader_approval_preferred() -> None:
    rt = claude()
    result = rt.classify(screens.PERMISSION)
    assert [o.key for o in result.options] == ["1", "2", "3"]
    assert rt.choose_option(AgentState.NEEDS_PERMISSION, result.options) == "2"
    assert rt.choose_option(AgentState.PLAN_REVIEW, rt.classify(screens.PLAN).options) == "1"
    assert rt.choose_option(AgentState.NEEDS_ANSWER, rt.classify(screens.QUESTION).options) is None


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
