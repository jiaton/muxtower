"""A name muxtower gives a Claude Code session is its name on Claude's side too: given as it starts
(`--name`, unless its arguments give one), and, renamed later, retitled on Remote Control, or told
`/rename` in its pane, only while it is idle at its input box."""

from collections.abc import Callable
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI

from muxtower.runtimes.models import AgentState
from muxtower.runtimes.spec import load_runtimes
from muxtower.sessions.interrupted import launch_options
from muxtower.sessions.models import CreateSession
from muxtower.sessions.service import named
from muxtower.sessions.titles import ClaudeTitles
from tests.fakes import FakeTmux

CLAUDE = load_runtimes(None)["claude-code"].config
CODEX = load_runtimes(None)["codex"].config


def test_the_name_is_given_unless_the_arguments_give_one() -> None:
    assert named(CLAUDE, "mac 浏览器 worker", ["--model", "opus"]) == ["--name", "mac 浏览器 worker"]
    assert named(CLAUDE, "x", ["-n", "mine"]) == [] and named(CLAUDE, "x", ["--name=mine"]) == []
    assert named(CLAUDE, None, []) == []
    assert named(CODEX, "x", []) == []  # Codex takes no name as it starts


def _argv(tmux: FakeTmux, session_id: str) -> list[str]:
    return next(p for p in tmux.panes.values() if p.env.get("MUXTOWER_SESSION_ID") == session_id).argv


def test_a_named_start_hands_it_on_and_a_bare_remote_control_takes_no_prompt(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app = make_app()
    made = app.state.sessions.create(
        CreateSession(
            runtime="claude", cwd=str(tmp_path), name="browser worker", args=["--remote-control"], prompt="hi"
        )
    )
    argv = _argv(tmux, made.id)
    assert argv[argv.index("--name") + 1] == "browser worker"
    assert argv[-3:] == ["--remote-control", "--", "hi"]  # the prompt never its value
    plain = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path)))
    assert "--name" not in _argv(tmux, plain.id)  # no name given: Claude names it


def test_started_again_a_bare_remote_control_keeps_the_option_after_it() -> None:
    assert launch_options(["--remote-control", "--model", "opus", "fix it"], CLAUDE) == [
        "--remote-control",
        "--model",
        "opus",
    ]
    assert launch_options(["--remote-control", "box", "fix it"], CLAUDE) == ["--remote-control", "box"]


def _session(**over: Any) -> SimpleNamespace:
    base = dict(
        id="s1", runtime="claude-code", remote_id=None, state=AgentState.IDLE, needs_attention=False, pending=None,
        archived_at=None, capabilities=SimpleNamespace(screen=True),
    )  # fmt: skip
    return SimpleNamespace(**{**base, **over})


def test_renamed_with_remote_control_it_is_retitled_there() -> None:
    retitled: list[tuple[str, str]] = []
    remote = SimpleNamespace(rename=lambda sid, title: retitled.append((sid, title)))
    typed: list[Any] = []
    directory: Any = SimpleNamespace(source_of=lambda sid: remote, send_input=lambda *a: typed.append(a))
    ClaudeTitles(directory).renamed(_session(remote_id="cse_1"), "mac 浏览器\nworker")  # type: ignore[arg-type]
    assert retitled == [("cse_1", "mac 浏览器 worker")] and typed == []


def test_renamed_in_tmux_it_is_told_rename_only_while_idle_at_its_input_box() -> None:
    now = {"s1": _session(state=AgentState.BUSY)}
    typed: list[tuple[str, str]] = []
    directory: Any = SimpleNamespace(
        source_of=lambda sid: None,
        find=lambda sid: now.get(sid),
        send_input=lambda sid, body: typed.append((sid, body.text)),
    )
    titles = ClaudeTitles(directory)
    titles.renamed(now["s1"], "Muxtower Worker")  # type: ignore[arg-type]
    assert typed == [] and titles.waiting == {"s1": "Muxtower Worker"}  # mid-turn: later
    now["s1"] = _session(state=AgentState.NEEDS_PERMISSION, needs_attention=True, pending=object())
    titles.flush()
    assert typed == []  # a dialog up: typing would answer it
    now["s1"] = _session()
    titles.flush()
    assert typed == [("s1", "/rename Muxtower Worker")] and titles.waiting == {}
    titles.renamed(_session(runtime="codex"), "x")  # type: ignore[arg-type]
    assert titles.waiting == {}  # Codex: nothing to tell
