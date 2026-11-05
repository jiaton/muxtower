"""A first prompt reaches the agent as it was written, whatever its length, lines or characters: last, after
`--` (Claude Code's `--mcp-config` takes several values, and took the prompt for one more, exiting at once).
An agent that exits as it starts is no session: starting it fails with what it said, here and on a node."""

from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.errors import Conflict
from muxtower.infra.tmux import literal
from muxtower.mcp.session_tools import StartArgs
from tests.fakes import FakeTmux

PROMPT = (
    "Set up the phone check 📱✅🤝🔒 — “quoted” 'single' \"double\" https://example.com/a?b=c&d=e\n"
    "• 中文的一行，带「引号」\n"
) * 30 + "and end with a semicolon;"


def _argv(tmux: FakeTmux, session_id: str) -> list[str]:
    return next(p for p in tmux.panes.values() if p.env.get("MUXTOWER_SESSION_ID") == session_id).argv


def test_the_first_prompt_is_the_last_argument_after_every_option(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app = make_app()
    tools = app.state.mcp.session_tools
    said = tools.start_session(StartArgs(cwd=str(tmp_path), prompt=PROMPT))
    created = next(s for s in app.state.directory.list() if s.id in said)
    argv = _argv(tmux, created.id)
    assert "--mcp-config" in argv and argv[-2:] == ["--", PROMPT]
    assert len(PROMPT.encode()) > 3000


def test_a_prompt_ending_in_a_semicolon_keeps_it_through_tmux() -> None:
    assert literal("end;") == "end\;" and literal(";") == "\;" and literal("mid;dle") == "mid;dle"
    assert literal("end\;") == "end\\\;"  # tmux takes the last "\;" for ";": the backslash before stays


def test_an_agent_that_exits_as_it_starts_is_an_error_with_what_it_said(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app = make_app()
    client = TestClient(app)
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}
    tmux.exits_with = "Error: Invalid MCP configuration"
    refused = client.post("/v1/sessions", json={"runtime": "claude", "cwd": str(tmp_path)}, headers=auth)
    assert refused.status_code == 409 and "Invalid MCP configuration" in refused.json()["detail"]
    assert client.get("/v1/sessions", headers=auth).json() == []  # no session left behind
    tmux.exits_with = "Error: no such thing"
    with pytest.raises(Conflict, match="no such thing"):
        app.state.mcp.session_tools.start_session(StartArgs(cwd=str(tmp_path), prompt=PROMPT))  # not "Started"


def test_on_a_node_the_same(make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path) -> None:
    node = make_app(state_dir=tmp_path / "node")
    request = {"runtime": "claude", "cwd": str(tmp_path), "prompt": PROMPT}
    made = node.state.hub.api.handle("create", {"request": request})  # as the hub forwards it
    assert _argv(tmux, made["id"])[-2:] == ["--", PROMPT]
    tmux.exits_with = "Error: Invalid MCP configuration"
    with pytest.raises(Conflict, match="Invalid MCP configuration"):
        node.state.hub.api.handle("create", {"request": request})


def test_the_hub_forwards_the_prompt_to_the_node() -> None:
    from muxtower.sessions.models import CreateSession

    body = CreateSession(runtime="claude", cwd="/w", prompt=PROMPT, node="mac").model_copy(update={"node": None})
    assert body.model_dump(mode="json")["prompt"] == PROMPT  # what `NodeSource.create` sends
