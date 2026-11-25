"""The project of a Remote Control session with no process on the hub (the Claude app, claude.ai): its
folder is read on the machine it runs on, through the link for a node (`place`), and kept as its worked-out
project. Made-up repositories in temporary folders; a hub served by uvicorn and a node on its own event loop
(`test_node_link.py`)."""

import asyncio
import subprocess
import threading
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
import uvicorn
from fastapi import FastAPI

from muxtower.app import create_app
from muxtower.nodes import protocol
from muxtower.sources.remote_control.ports import RawEvent
from muxtower.sources.remote_control.service import RemoteControlSource
from muxtower.teams import remote_places
from muxtower.teams.remote_places import RemotePlaces
from tests.fakes import FakeTmux
from tests.integration.test_node_link import Running, _free_port, _settings, _until
from tests.rc_fakes import FakeRemoteControl, session

ENVIRONMENTS = {"env_mac": "mac", "env_hub": "nas"}  # the Remote Control machines the hub knows by name


def _repo(path: Path, remote: str | None = None) -> str:
    path.mkdir(parents=True)
    subprocess.run(["git", "init", "-q", str(path)], check=True)  # noqa: S603, S607
    who = ["-c", "user.name=Dev", "-c", "user.email=dev@example.com"]
    subprocess.run(["git", "-C", str(path), *who, "commit", "-q", "--allow-empty", "-m", "start"], check=True)  # noqa: S603, S607
    if remote:
        subprocess.run(["git", "-C", str(path), "remote", "add", "origin", remote], check=True)  # noqa: S603, S607
    return str(path)


def _in(cwd: str) -> list[RawEvent]:
    return [RawEvent(1, None, "worker", {"type": "system", "subtype": "vcs_state_changed", "cwd": cwd})]


class Hub:
    def __init__(self, app: FastAPI, url: str, port: FakeRemoteControl, source: RemoteControlSource) -> None:
        self.app, self.url, self.port, self.source = app, url, port, source
        self.places: RemotePlaces = app.state.remote_places

    def add(self, sid: str, env: str | None, cwd: str) -> None:
        self.port.sessions.append(session(sid, title=sid, environment_id=env))
        self.port.events[sid] = _in(cwd)
        self.source.tick()

    def place(self) -> int:
        """One pass of the loop, on the hub's event loop (where the links are)."""
        loop = self.app.state.nodes.loop
        if loop is None:  # no node linked yet: any loop will do
            return asyncio.run(self.places.run_once())
        result: int = asyncio.run_coroutine_threadsafe(self.places.run_once(), loop).result(30)
        return result

    def project(self, sid: str) -> tuple[str | None, str | None]:
        listed = self.app.state.directory.get(sid)
        return listed.project, listed.project_source


@pytest.fixture
def hub(tmp_path: Path) -> Iterator[Hub]:
    port = FakeRemoteControl()
    source = RemoteControlSource(port, ENVIRONMENTS)
    number = _free_port()
    app = create_app(
        _settings(tmp_path, "nas", number), tmux=FakeTmux(), run_loops=False, remote_control=source
    )  # fmt: skip
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=number, log_level="warning", lifespan="off"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    _until(lambda: server.started)
    yield Hub(app, f"http://127.0.0.1:{number}", port, source)
    server.should_exit = True
    thread.join(5)


def _node(tmp_path: Path) -> FastAPI:
    return create_app(_settings(tmp_path, "mac", _free_port()), tmux=FakeTmux(), run_loops=False)


def _join(hub: Hub, node: FastAPI) -> Running:
    link = Running(node.state.hub.run_loop())
    assert node.state.hub.join(hub.url, hub.app.state.pairing.create_code("phone").code).name == "mac"
    _until(lambda: hub.app.state.nodes.node("mac").online)
    return link


def test_a_session_on_a_node_gets_the_node_s_project_for_its_folder(hub: Hub, tmp_path: Path) -> None:
    shop = _repo(tmp_path / "work" / "shop", "git@example.com:acme/shop.git")
    loose = tmp_path / "work" / "notes"
    loose.mkdir()
    ledger = _repo(tmp_path / "hub" / "ledger")  # on the hub's own machine, no remote
    hub.add("cse_APP", "env_mac", shop)  # the Claude app on the node, in a repository there
    hub.add("cse_TWO", "env_mac", shop)  # another, in the same folder
    hub.add("cse_SET", "env_mac", shop)  # one the owner moved already
    hub.add("cse_LOOSE", "env_mac", str(loose))  # in no repository
    hub.add("cse_FAR", "env_far0042", shop)  # a machine that is no node (claude.ai's "env …")
    hub.add("cse_HERE", "env_hub", ledger)  # on the hub itself, with no process here
    hub.app.state.teams.set_project("cse_SET", "acme/launch")
    node = _node(tmp_path)
    link = _join(hub, node)
    try:
        assert hub.place() == 3
        assert hub.project("cse_APP") == ("acme/shop", "git remote")
        assert hub.project("cse_TWO") == ("acme/shop", "git remote")
        assert hub.places.asked == 2  # one ask per (node, folder): the shop and the loose folder
        assert hub.project("cse_SET") == ("acme/launch", "set")  # never replaced
        assert hub.project("cse_LOOSE") == (None, None)  # its folder group, as before
        assert hub.project("cse_FAR") == (None, None)
        assert hub.project("cse_HERE") == ("ledger", "git root")
        assert hub.app.state.teams.find("cse_APP").project_source == "git remote"  # as `my_team` says it

        # Known now: a new session in the same folder asks nothing; nothing is asked again.
        hub.add("cse_THREE", "env_mac", shop)
        assert hub.place() == 1 and hub.places.asked == 2
        assert hub.project("cse_THREE") == ("acme/shop", "git remote")
        assert hub.place() == 0 and hub.places.asked == 2
    finally:
        link.stop()


def test_an_offline_or_older_node_leaves_the_folder_until_it_links_again(
    hub: Hub, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    shop = _repo(tmp_path / "work" / "shop", "https://example.com/acme/shop.git")
    hub.add("cse_APP", "env_mac", shop)
    node = _node(tmp_path)
    now = [1000.0]
    hub.places.clock = lambda: now[0]
    # A node too old to know `place`: it answers "unknown method".
    monkeypatch.setattr(protocol, "METHODS", protocol.METHODS - {"place"})
    link = _join(hub, node)
    try:
        assert hub.place() == 0 and hub.places.asked == 1
        assert hub.project("cse_APP") == (None, None)
        assert hub.place() == 0 and hub.places.asked == 1  # not asked again at once
        now[0] += remote_places.RETRY_SECONDS
        assert hub.place() == 0 and hub.places.asked == 2  # nor more often than every few minutes

        link.stop()  # offline: nothing to ask
        _until(lambda: not hub.app.state.nodes.node("mac").online)
        now[0] += remote_places.RETRY_SECONDS
        assert hub.place() == 0 and hub.places.asked == 2
        assert hub.project("cse_APP") == (None, None)

        monkeypatch.setattr(protocol, "METHODS", protocol.METHODS | {"place"})  # updated, and back
        link = Running(node.state.hub.run_loop())
        _until(lambda: hub.app.state.nodes.node("mac").online)
        assert hub.place() == 1 and hub.places.asked == 3  # at once: it linked again
        assert hub.project("cse_APP") == ("acme/shop", "git remote")
    finally:
        link.stop()


def test_listing_never_waits_on_a_slow_node(hub: Hub, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    shop = _repo(tmp_path / "work" / "shop", "git@example.com:acme/shop.git")
    hub.add("cse_APP", "env_mac", shop)
    node = _node(tmp_path)
    answered = threading.Event()
    place = node.state.hub.api.place

    def slow(cwd: str) -> Any:
        answered.wait(10)
        return place(cwd)

    monkeypatch.setattr(node.state.hub.api, "place", slow)
    _, token = hub.app.state.tokens.create("phone")
    phone = httpx.Client(base_url=hub.url, headers={"Authorization": f"Bearer {token}"}, timeout=10)
    link = _join(hub, node)
    try:
        loop = hub.app.state.nodes.loop
        assert loop is not None
        pending = asyncio.run_coroutine_threadsafe(hub.places.run_once(), loop)
        _until(lambda: hub.places.asked == 1)
        started = time.monotonic()
        listed = {s["id"]: s for s in phone.get("/v1/sessions").json()}
        assert time.monotonic() - started < 2 and listed["cse_APP"]["project"] is None
        answered.set()
        assert pending.result(15) == 1
        assert {s["id"]: s for s in phone.get("/v1/sessions").json()}["cse_APP"]["project"] == "acme/shop"
    finally:
        answered.set()
        link.stop()


def test_a_node_reads_a_folder_given_from_home_and_refuses_a_relative_one(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _repo(tmp_path / "home" / "work" / "shop", "git@example.com:acme/shop.git")
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    api = _node(tmp_path).state.hub.api
    assert api.place("~/work/shop") == {"project": "acme/shop", "source": "git remote"}
    assert api.place("work/shop") is None
    assert api.place(str(tmp_path / "home" / "work")) is None  # in no repository
