"""On a node whose link to its hub is down (just started, reconnecting) or whose hub is too old, the tools
say so: other machines are there but not listed, try again shortly; never "this machine is all there is".
While linked, a node lists every machine's sessions and starts one on another machine through its hub."""

import json
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI

from muxtower.errors import Invalid, Unavailable
from muxtower.mcp.session_tools import StartArgs
from muxtower.mcp.team_tools import INSTRUCTIONS
from muxtower.nodes import client as hub_client
from muxtower.nodes.store import Joined


def _node(make_app: Callable[..., FastAPI], tmp_path: Path) -> FastAPI:
    app = make_app(state_dir=tmp_path / "node")
    app.state.hub.store.save(Joined(url="https://hub.example", name="mac", token="t"))
    return app


def test_a_link_down_is_told_with_since_when_and_to_try_again(
    make_app: Callable[..., FastAPI], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    hub = _node(make_app, tmp_path).state.hub
    hub.started -= 60  # running a while: no waiting for the link
    hub.down_since = datetime(2026, 11, 4, 20, 17, 45).astimezone()
    hub.error = "cannot reach the hub: [Errno 111] Connection refused"
    with pytest.raises(Unavailable) as down:
        hub.team_tool("my_team", {}, "s1")
    said = str(down.value)
    assert "node of the hub https://hub.example" in said and "reconnecting since 20:17:45" in said
    assert "other machines and their sessions are not listed" in said and "try again in a few seconds" in said

    hub.connected, hub._session, hub._loop, hub.hub_protocol = True, object(), object(), 1
    with pytest.raises(Unavailable, match="older muxtower .* update the hub"):
        hub.team_tool("my_team", {}, "s1")


def test_just_started_it_waits_a_moment_for_its_link(
    make_app: Callable[..., FastAPI], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    hub = _node(make_app, tmp_path).state.hub
    monkeypatch.setattr(hub_client, "LINK_WAIT_SECONDS", 0.3)
    slept: list[float] = []
    monkeypatch.setattr(hub_client.time, "sleep", lambda s: slept.append(s))
    with pytest.raises(Unavailable, match="link to the hub is down"):
        hub.team_tool("my_team", {}, "s1")
    assert slept  # it waited for the link before saying it is down


def _down(name: str, arguments: dict[str, Any], session_id: str | None) -> str | None:
    raise Unavailable("this machine is a node of the hub https://hub.example, and its link to the hub is down")


def test_list_sessions_and_my_team_say_why_only_this_machine_shows(
    make_app: Callable[..., FastAPI], tmp_path: Path
) -> None:
    app = make_app()
    tools = app.state.mcp
    tools.team_tools.forward = _down
    for name in ("list_sessions", "start_session"):
        tools.tools[name] = _rewrapped(tools, name, _down)
    listed = tools.tools["list_sessions"].run(tools.tools["list_sessions"].args())
    assert listed.startswith("NOTE: this machine is a node of the hub") and "Only this machine's sessions" in listed
    team = tools.tools["my_team"].run(_team_args())
    assert team.startswith("NOTE: this machine is a node of the hub")
    with pytest.raises(Unavailable, match="nas is not this machine, and this machine is a node"):
        tools.tools["start_session"].run(StartArgs(cwd=str(tmp_path), machine="@NAS"))
    assert "Started" in tools.tools["start_session"].run(StartArgs(cwd=str(tmp_path)))  # here: no hub needed


def test_an_older_hub_is_told_as_such(make_app: Callable[..., FastAPI], tmp_path: Path) -> None:
    def old(name: str, arguments: dict[str, Any], session_id: str | None) -> str | None:
        raise Invalid(f"no team tool {name!r} here")

    tools = make_app().state.mcp
    listed = _rewrapped(tools, "list_sessions", old).run(tools.tools["list_sessions"].args())
    assert "older muxtower" in listed and "update the hub" in listed


def test_linked_a_node_lists_and_starts_through_its_hub(make_app: Callable[..., FastAPI], tmp_path: Path) -> None:
    asked: list[tuple[str, dict[str, Any]]] = []

    def hub(name: str, arguments: dict[str, Any], session_id: str | None) -> str | None:
        asked.append((name, arguments))
        return "s9 · web · @nas · …" if name == "list_sessions" else "Started web (s9) on nas in /srv."

    tools = make_app().state.mcp
    assert _rewrapped(tools, "list_sessions", hub).run(tools.tools["list_sessions"].args()) == "s9 · web · @nas · …"
    started = _rewrapped(tools, "start_session", hub).run(StartArgs(cwd="/srv", machine="nas", prompt="hi"))
    assert started.endswith("on nas in /srv.") and asked[-1][1]["prompt"] == "hi"


async def test_the_hub_answers_a_nodes_list_sessions(make_app: Callable[..., FastAPI]) -> None:
    from muxtower.nodes import asked

    tools = make_app().state.mcp
    frame = {"id": 1, "method": "team_tool", "params": {"tool": "list_sessions", "arguments": {}}}
    reply = json.loads(await asked.answer(tools, "mac", frame))
    assert reply["result"]["text"] == "No sessions."


def test_the_instructions_say_not_to_conclude_a_machine_has_no_muxtower() -> None:
    assert "Never conclude another machine has no muxtower" in INSTRUCTIONS


def _team_args() -> Any:
    from muxtower.mcp.team_tools import TeamArgs

    return TeamArgs()


def _rewrapped(tools: Any, name: str, forward: Any) -> Any:
    """The tool as McpTools wraps it on a node with this `forward`."""
    from dataclasses import replace

    from muxtower.mcp.reach import listing_everywhere, starting_anywhere

    plain = {"list_sessions": tools.list_sessions, "start_session": tools.session_tools.start_session}[name]
    tool = tools.tools[name]
    run = (
        listing_everywhere(name, plain, forward)
        if name == "list_sessions"
        else starting_anywhere(plain, forward, tools.hub)
    )
    return replace(tool, run=run)
