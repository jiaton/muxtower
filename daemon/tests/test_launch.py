"""How sessions start: in the mode asked for, else the configured default, else as the agent's own settings
say (nothing added); an agent never starts one above the owner's default; the mode stays across a resume."""

from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.errors import Forbidden
from muxtower.mcp.session_tools import StartArgs
from muxtower.runtimes.spec import load_runtimes
from muxtower.sessions.launch import agent_may_ask, launch_args, mode_of
from tests.fakes import FakeTmux

CLAUDE = load_runtimes(None)["claude-code"].config
CODEX = load_runtimes(None)["codex"].config


def test_each_runtime_says_its_modes_and_what_they_add() -> None:
    assert launch_args(CLAUDE, "agent", [], ["hi"]) == ["hi"]  # its own settings: nothing added
    assert launch_args(CLAUDE, "plan", ["--model", "opus"], []) == ["--permission-mode", "plan", "--model", "opus"]
    assert launch_args(CODEX, "full-auto", [], []) == ["--full-auto"]
    assert mode_of(["--model", "opus", "--permission-mode", "acceptEdits"], CLAUDE) == "acceptEdits"
    assert [m.id for m in CODEX.permission_modes if m.dangerous] == ["full-access"]


def test_an_agent_never_asks_more_than_the_owner_set_up() -> None:
    agent_may_ask(CLAUDE, "plan", "agent", False)  # less than the usual: fine
    agent_may_ask(CLAUDE, "default", "agent", False)
    with pytest.raises(Forbidden, match="above the default"):
        agent_may_ask(CLAUDE, "acceptEdits", "default", False)
    agent_may_ask(CLAUDE, "acceptEdits", "acceptEdits", False)  # up to the owner's default
    with pytest.raises(Forbidden, match="owner's to choose"):
        agent_may_ask(CLAUDE, "bypassPermissions", "bypassPermissions", False)  # never dangerous by itself
    agent_may_ask(CLAUDE, "bypassPermissions", "agent", True)  # unless the owner allowed it


def _pane_argv(tmux: FakeTmux, session_id: str) -> list[str]:
    return next(p for p in tmux.panes.values() if p.env.get("MUXTOWER_SESSION_ID") == session_id).argv


def test_the_default_applies_the_dialog_overrides_and_resume_keeps_it(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app = make_app(**{"launch.claude_code_mode": "acceptEdits", "launch.claude_code_args": ["--model", "opus"]})
    client = TestClient(app)
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}
    plain = client.post("/v1/sessions", json={"runtime": "claude", "cwd": str(tmp_path)}, headers=auth).json()
    argv = _pane_argv(tmux, plain["id"])
    assert argv[argv.index("--permission-mode") + 1] == "acceptEdits" and "opus" in argv
    assert plain["permission_mode"] == "acceptEdits"
    asked = {"runtime": "claude", "cwd": str(tmp_path), "permission_mode": "plan", "args": ["--verbose"]}
    chosen = client.post("/v1/sessions", json=asked, headers=auth).json()
    argv = _pane_argv(tmux, chosen["id"])
    assert argv[argv.index("--permission-mode") + 1] == "plan" and "--verbose" in argv  # this session's choice
    assert client.post("/v1/sessions", json={**asked, "permission_mode": "nope"}, headers=auth).status_code == 400
    assert app.state.sessions.repo.get(chosen["id"]).launch_args[:2] == ["--permission-mode", "plan"]  # resumed so
    modes = {r["name"]: r for r in client.get("/v1/runtimes", headers=auth).json()}["claude-code"]
    assert modes["default_mode"] == "acceptEdits" and any(m["dangerous"] for m in modes["permission_modes"])


def test_start_session_from_an_agent_is_refused_above_the_default_and_audited(
    make_app: Callable[..., FastAPI], tmp_path: Path
) -> None:
    app = make_app()
    tools = app.state.mcp.session_tools
    with pytest.raises(Forbidden):
        tools.start_session(StartArgs(cwd=str(tmp_path), permission_mode="bypassPermissions"))
    assert "Started" in tools.start_session(StartArgs(cwd=str(tmp_path), permission_mode="plan"))
    tools.may_escalate = lambda: True
    assert "Started" in tools.start_session(StartArgs(cwd=str(tmp_path), permission_mode="bypassPermissions"))
