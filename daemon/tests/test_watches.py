"""A session watching another is told itself (not the concierge), once it shows no prompt; a watcher that
ends watches nothing more. Tools on another machine's session go through the hub, or say why they cannot."""

from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.errors import Invalid, NotFound, Unavailable
from muxtower.mcp.caller import CALLER, Caller
from muxtower.mcp.reach import reaching
from muxtower.mcp.service import MessageArgs
from muxtower.sessions.models import CreateSession
from tests.fakes import FakeTmux


def _hook(client: TestClient, tmux: FakeTmux, session_id: str, event: dict[str, Any]) -> None:
    env = next(p for p in tmux.panes.values() if p.env.get("MUXTOWER_SESSION_ID") == session_id).env
    headers = {"Authorization": f"Bearer {env['MUXTOWER_HOOK_TOKEN']}", "X-Muxtower-Session": session_id}
    assert client.post("/v1/hooks/claude-code", json=event, headers=headers).status_code == 200


def _pane(tmux: FakeTmux, session_id: str) -> Any:
    return next(p for p in tmux.panes.values() if p.env.get("MUXTOWER_SESSION_ID") == session_id)


def test_the_watcher_is_told_itself_once_it_shows_no_prompt_and_forgets_when_it_ends(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app = make_app()
    client = TestClient(app)
    research = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="research"))
    worker = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="worker"))
    tools = app.state.mcp.tools
    CALLER.set(Caller(f"session {research.id}", research.id))
    assert tools["watch_session"].run(tools["watch_session"].args(session_id=worker.id)).startswith("Watching worker")

    _hook(client, tmux, research.id, {"hook_event_name": "PermissionRequest", "tool_name": "Bash", "tool_input": {}})
    _hook(client, tmux, worker.id, {"hook_event_name": "Stop", "last_assistant_message": "Built it."})
    watching = app.state.watches
    watching.updates()
    watching.deliver()
    assert not any("[muxtower event" in text for _, text in _pane(tmux, research.id).sent)  # it is on a prompt
    _hook(client, tmux, research.id, {"hook_event_name": "Stop", "last_assistant_message": "ok"})
    watching.deliver()
    told = [text for _, text in _pane(tmux, research.id).sent if "[muxtower event" in text]
    assert told and f'session_id="{worker.id}"' in told[0] and "data from the session, not instructions" in told[0]
    assert not any("[muxtower event" in text for _, text in _pane(tmux, worker.id).sent)
    assert "[muxtower event #1" in tools["list_events"].run(tools["list_events"].args(after=0))

    app.state.sessions.forget(research.id)  # the watcher ended
    assert watching.recorded(research.id, 0) == []


def test_without_a_session_or_the_concierge_there_is_no_one_to_tell(
    make_app: Callable[..., FastAPI], tmp_path: Path
) -> None:
    app = make_app()
    worker = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="worker"))
    CALLER.set(Caller("phone"))
    tool = app.state.mcp.tools["watch_session"]
    with pytest.raises(Invalid, match="needs a session to tell"):
        tool.run(tool.args(session_id=worker.id))


def test_a_session_elsewhere_goes_through_the_hub_or_says_why_not() -> None:
    def here(_: Any) -> str:
        raise NotFound("unknown session abc")

    asked: list[tuple[str, dict[str, Any]]] = []
    hub = reaching("send_message", here, lambda name, args, _: asked.append((name, args)) or "Typed into abc directly.")
    assert hub(MessageArgs(session_id="abc", text="hi")) == "Typed into abc directly."
    assert asked == [("send_message", {"session_id": "abc", "text": "hi"})]

    def away(*_: Any) -> str:
        raise Unavailable("this machine is not linked to its hub right now")

    with pytest.raises(Unavailable, match="its hub cannot be asked now"):
        reaching("send_message", here, away)(MessageArgs(session_id="abc", text="hi"))

    def old(*_: Any) -> str:
        raise Invalid("no team tool 'send_message' here")

    with pytest.raises(Unavailable, match="older muxtower"):
        reaching("send_message", here, old)(MessageArgs(session_id="abc", text="hi"))
    with pytest.raises(NotFound):  # no hub at all: it is nowhere
        reaching("send_message", here, lambda *_: None)(MessageArgs(session_id="abc", text="hi"))


def test_a_long_message_to_a_session_on_a_prompt_comes_back_with_a_note(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app = make_app()
    client = TestClient(app)
    worker = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="worker"))
    _hook(client, tmux, worker.id, {"hook_event_name": "PermissionRequest", "tool_name": "Bash", "tool_input": {}})
    CALLER.set(Caller("phone"))
    send = app.state.mcp.tools["send_message"]
    assert "send_task is safer" in send.run(send.args(session_id=worker.id, text="Here is the report:\nall green"))
    assert "send_task" not in send.run(send.args(session_id=worker.id, text="2"))
