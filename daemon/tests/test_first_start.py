"""A first start waits on the owner (the theme, then how to sign in) before there is any input box: it needs
an answer, with its choices as they read, never approved for the owner; the same words quoted in a diff or
a reply above the input box are no dialog."""

from muxtower.runtimes.models import AgentState
from muxtower.runtimes.spec import load_runtimes
from tests import screens


def test_each_first_start_dialog_needs_the_owner_with_its_choices_as_they_read() -> None:
    runtimes = load_runtimes(None)
    claude, codex = runtimes["claude-code"], runtimes["codex"]

    theme = claude.classify(screens.FIRST_THEME)
    assert (theme.state, theme.rule) == (AgentState.NEEDS_ANSWER, "first-start-theme")
    assert [o.label for o in theme.options][:3] == ["Auto (match terminal)", "Dark mode", "Light mode"]
    assert len(theme.options) == 7 and theme.menu is not None and theme.menu.cursor == 1  # "❯ ✔ Dark mode"

    login = claude.classify(screens.FIRST_LOGIN)
    assert (login.state, login.rule) == (AgentState.NEEDS_ANSWER, "first-start-login")
    assert [(o.key, o.label) for o in login.options] == [
        ("1", "Claude account with subscription · Individual, Team, or Enterprise"),
        ("2", "Anthropic Console account · API usage billing"),
        ("3", "3rd-party platform · Amazon Bedrock, Microsoft Foundry, Google Vertex AI"),
    ]

    sign_in = codex.classify(screens.CODEX_FIRST_SIGN_IN)
    assert (sign_in.state, sign_in.rule) == (AgentState.NEEDS_ANSWER, "first-start-sign-in")
    assert [o.label for o in sign_in.options] == [
        "Sign in with ChatGPT · Usage included with Plus, Pro, Business, and Enterprise plans",
        "Sign in with Device Code · Sign in from another device with a one-time code",
        "Use an OpenAI API key · Pay for what you use",
        "Use Amazon Bedrock · Connect using your AWS credentials",
    ]
    assert sign_in.menu is not None and [s.key for s in codex.select_steps(sign_in.menu, "2")] == ["Down", "Enter"]

    for runtime, result in ((claude, theme), (claude, login), (codex, sign_in)):
        assert AgentState.NEEDS_ANSWER not in runtime.config.auto_approve_states
        assert runtime.choose_option(result.state, result.options) is None  # the owner picks, always


def test_the_same_words_quoted_above_the_input_box_are_no_dialog() -> None:
    runtimes = load_runtimes(None)
    claude, codex = runtimes["claude-code"], runtimes["codex"]
    assert claude.classify(screens.BUSY_QUOTING_FIRST_START).state == AgentState.BUSY
    idle = claude.classify(screens.IDLE_QUOTING_FIRST_START)
    assert idle.state == AgentState.IDLE and idle.rule is None
    codex_idle = codex.classify(screens.CODEX_IDLE_QUOTING_FIRST_START)
    assert codex_idle.state == AgentState.IDLE and codex_idle.rule is None


def test_first_start_dialogs_are_found_under_a_long_screen() -> None:
    runtimes = load_runtimes(None)
    for runtime, screen in (
        ("claude-code", screens.FIRST_THEME),
        ("claude-code", screens.FIRST_LOGIN),
        ("codex", screens.CODEX_FIRST_SIGN_IN),
    ):
        assert runtimes[runtime].classify(screens.LONG_IDLE.rsplit(">", 1)[0] + screen).state == AgentState.NEEDS_ANSWER
