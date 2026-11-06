"""Where a new session starts when it is given no folder: the machine's `[sessions] default_cwd` (~ is
home), else, unset or not a folder there, the home folder. The app shows it, start_session takes it (a
node's own for machine=…), and my_team says each machine's."""

import os
from collections.abc import Callable
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.config import SessionSettings
from muxtower.mcp.session_tools import StartArgs
from muxtower.sessions.models import CreateSession


def test_the_default_folder_is_the_setting_else_home(tmp_path: Path) -> None:
    home = os.path.expanduser("~")
    assert SessionSettings().folder() == home
    assert SessionSettings(default_cwd=str(tmp_path)).folder() == str(tmp_path)
    assert SessionSettings(default_cwd=str(tmp_path / "gone")).folder() == home  # no such folder
    assert SessionSettings(default_cwd="~").folder() == home
    assert SessionSettings(default_cwd="  ").folder() == home


def test_a_session_given_no_folder_starts_in_the_default(make_app: Callable[..., FastAPI], tmp_path: Path) -> None:
    work = tmp_path / "workspace"
    work.mkdir()
    app = make_app(**{"sessions.default_cwd": str(work)})
    assert app.state.sessions.create(CreateSession(runtime="claude")).cwd == str(work)
    said = app.state.mcp.session_tools.start_session(StartArgs(name="w"))
    assert f"in {work} (the machine's default folder)." in said
    assert "default folder" not in app.state.mcp.session_tools.start_session(StartArgs(cwd=str(tmp_path)))


def test_the_setting_round_trips_and_me_says_it(make_app: Callable[..., FastAPI], tmp_path: Path) -> None:
    app = make_app()
    client = TestClient(app)
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}
    changed = client.patch("/v1/settings", json={"values": {"sessions.default_cwd": str(tmp_path)}}, headers=auth)
    view = next(s for s in changed.json()["settings"] if s["key"] == "sessions.default_cwd")
    assert (view["value"], view["source"], view["section"]) == (str(tmp_path), "app", "New sessions")
    assert client.get("/v1/me", headers=auth).json()["default_folder"] == str(tmp_path)  # at once
    client.patch("/v1/settings", json={"values": {"sessions.default_cwd": ""}}, headers=auth)  # empty: home
    assert client.get("/v1/me", headers=auth).json()["default_folder"] == os.path.expanduser("~")


def test_on_a_node_its_own_default_is_used(make_app: Callable[..., FastAPI], tmp_path: Path) -> None:
    mac = tmp_path / "workspace-on-mac"
    mac.mkdir()
    node = make_app(state_dir=tmp_path / "node", **{"sessions.default_cwd": str(mac)})
    made = node.state.hub.api.handle("create", {"request": {"runtime": "claude", "cwd": None}})  # as the hub sends it
    assert made["cwd"] == str(mac)
    assert node.state.hub.api.handle("default_folder", {}) == str(mac)


def test_my_team_says_each_machines_default_folder(make_app: Callable[..., FastAPI], tmp_path: Path) -> None:
    app = make_app(**{"sessions.default_cwd": str(tmp_path)})
    tools = app.state.mcp.team_tools
    assert tools.machines()[0][1] == str(tmp_path)
    tools.machines = lambda: [("nas", str(tmp_path)), ("mac", "/Users/me/workspace")]
    me = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="me"))
    from muxtower.mcp.caller import CALLER, Caller

    CALLER.set(Caller("test", me.id))
    said = tools.my_team(tools.tools()[0].args())
    assert f"start_session uses when given no cwd: @nas {tmp_path} · @mac /Users/me/workspace" in said
