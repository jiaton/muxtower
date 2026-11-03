"""A node and its hub over a real link: a hub served by uvicorn, a node whose link loop runs on its own
event loop, each with its own state and a fake tmux. The node joins with a pairing code; its session is
then driven through the hub as if it ran there."""

import asyncio
import socket
import sys
import threading
import time
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
import uvicorn
from fastapi import FastAPI

from muxtower.app import create_app
from muxtower.config import load_settings
from tests import screens
from tests.fakes import FakeTmux


def _settings(root: Path, name: str, port: int) -> Any:
    return load_settings(
        config_file=root / "none.toml",
        env={},
        overrides={"name": name, "port": port, "state_dir": root / name, "config_dir": root / name, "serve_ui": False},
    )


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port: int = s.getsockname()[1]
        return port


def _until(check: Callable[[], Any], seconds: float = 10) -> Any:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if found := check():
            return found
        time.sleep(0.05)
    raise AssertionError("timed out")


class Running:
    """An event loop on a thread, running one coroutine until stopped."""

    def __init__(self, coro: Any) -> None:
        self.loop = asyncio.new_event_loop()
        self.task: asyncio.Task[Any] | None = None

        def run() -> None:
            asyncio.set_event_loop(self.loop)
            self.task = self.loop.create_task(coro)
            try:
                self.loop.run_until_complete(self.task)
            except asyncio.CancelledError:
                pass

        self.thread = threading.Thread(target=run, daemon=True)
        self.thread.start()

    def call(self, fn: Callable[..., Any], *args: Any) -> None:
        self.loop.call_soon_threadsafe(fn, *args)

    def stop(self) -> None:
        _until(lambda: self.task is not None)
        assert self.task is not None
        self.loop.call_soon_threadsafe(self.task.cancel)
        self.thread.join(5)


@pytest.fixture
def hub(tmp_path: Path) -> Iterator[tuple[FastAPI, str]]:
    port = _free_port()
    app = create_app(_settings(tmp_path, "nas", port), tmux=FakeTmux(), run_loops=False)
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning", lifespan="off"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    _until(lambda: server.started)
    yield app, f"http://127.0.0.1:{port}"
    server.should_exit = True
    thread.join(5)


def test_a_node_s_session_is_driven_through_its_hub(hub: tuple[FastAPI, str], tmp_path: Path) -> None:
    hub_app, hub_url = hub
    _, token = hub_app.state.tokens.create("phone")
    phone = httpx.Client(base_url=hub_url, headers={"Authorization": f"Bearer {token}"}, timeout=10)

    node_tmux = FakeTmux()
    node = create_app(_settings(tmp_path, "mac", _free_port()), tmux=node_tmux, run_loops=False)
    pane = node_tmux.add_pane("default", "work", "claude")
    pane.screen = screens.PERMISSION
    node.state.monitor.tick()
    link = Running(node.state.hub.run_loop())
    try:
        code = hub_app.state.pairing.create_code("phone").code
        assert node.state.hub.join(hub_url, code).name == "mac"
        _until(lambda: node.state.hub.status().connected)

        def listed() -> dict[str, Any] | None:
            return next((s for s in phone.get("/v1/sessions").json() if s.get("node") == "mac"), None)

        session = _until(listed)
        sid = session["id"]
        assert sid.startswith("mac~") and session["machine"] == "mac" and session["state"] == "needs_permission"
        assert [n["online"] for n in phone.get("/v1/nodes").json()] == [True]
        assert hub_app.state.nodes.node("mac").record.platform == sys.platform

        # Its screen, input and approval go to the node's pane.
        assert "rm -rf build/" in phone.get(f"/v1/sessions/{sid}/screen").json()["text"]
        assert phone.post(f"/v1/sessions/{sid}/input", json={"text": "hi", "enter": True}).status_code == 204
        assert phone.post(f"/v1/sessions/{sid}/approve", json={"option": "1"}).json()["option"] == "1"
        assert ("text", "hi") in pane.sent and ("key", "Enter") in pane.sent
        assert phone.post(f"/v1/sessions/{sid}/resize", json={"cols": 80, "rows": 40}).status_code == 204
        assert ("resize", "80x40") in pane.sent

        # What the hub changes there is listed here at once, not at the next resend.
        assert phone.patch(f"/v1/sessions/{sid}", json={"name": "renamed"}).status_code == 200
        _until(lambda: (s := listed()) and s["name"] == "renamed", seconds=5)

        # A change there reaches the list here.
        pane.screen = screens.IDLE
        node.state.monitor.tick()
        link.call(node.state.bus.publish, "sessions", None)
        _until(lambda: (s := listed()) and s["state"] == "idle")

        # Offline: still listed, read only.
        link.stop()
        offline = _until(lambda: (s := listed()) and s["offline"] and s)
        assert not offline["capabilities"]["screen"]
        assert phone.post(f"/v1/sessions/{sid}/input", json={"text": "x"}).status_code == 409

        # Back, then removed on the hub: the node forgets the hub.
        link = Running(node.state.hub.run_loop())
        _until(lambda: (s := listed()) and not s["offline"])
        assert phone.delete("/v1/nodes/mac").status_code == 204
        _until(lambda: node.state.hub.status().url is None)
        assert listed() is None
    finally:
        link.stop()


def test_a_node_s_sessions_see_the_whole_team_through_the_hub(hub: tuple[FastAPI, str], tmp_path: Path) -> None:
    from fastapi.testclient import TestClient

    from muxtower.sessions.models import CreateSession

    hub_app, hub_url = hub
    work = tmp_path / "shop"
    work.mkdir()
    research = hub_app.state.sessions.create(CreateSession(runtime="claude", cwd=str(work), name="research"))
    _, device = hub_app.state.tokens.create("phone")
    node_tmux = FakeTmux()
    node = create_app(_settings(tmp_path, "mac", _free_port()), tmux=node_tmux, run_loops=False)
    worker = node.state.sessions.create(CreateSession(runtime="claude", cwd=str(work), name="worker"))
    token = next(p for p in node_tmux.panes.values() if p.info.session_name == worker.tmux_session).env[
        "MUXTOWER_MCP_TOKEN"
    ]
    node_mcp = TestClient(node)

    def tool(client: Any, bearer: str, name: str, **arguments: Any) -> str:
        body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": arguments}}
        result = client.post("/v1/mcp", json=body, headers={"Authorization": f"Bearer {bearer}"}).json()["result"]
        return ("ERROR " if result["isError"] else "") + str(result["content"][0]["text"])

    link = Running(node.state.hub.run_loop())
    try:
        assert node.state.hub.join(hub_url, hub_app.state.pairing.create_code("phone").code).name == "mac"
        _until(lambda: node.state.hub.status().connected and node.state.hub.hub_protocol == 2)
        _until(lambda: any(s.id == f"mac~{worker.id}" for s in hub_app.state.directory.list()))
        hub_mcp = TestClient(hub_app)
        tool(hub_mcp, device, "set_role", role="research", session_id=research.id)

        # Asked on the node, answered by the hub, which sees both machines.
        mine = tool(node_mcp, token, "my_team")
        assert mine.startswith(f"You: mac~{worker.id} · worker · no role yet · @mac")
        assert f"- {research.id} · research · role: research" in mine
        assert tool(node_mcp, token, "set_role", role="worker").endswith("role worker.")
        sent = tool(node_mcp, token, "send_task", to="research", text="Spec is ready for review?")
        assert sent.startswith(f"Delivered to research (research, {research.id})")
        pane = next(
            p for t, p in hub_app.state.sessions.tmux.panes.items() if p.info.session_name == research.tmux_session
        )
        assert any(f"[muxtower task from worker (worker) · mac~{worker.id}]" in text for _, text in pane.sent)

        # Without its hub, the node answers for itself and says so.
        link.stop()
        _until(lambda: not node.state.hub.status().connected)
        alone = tool(node_mcp, token, "my_team")
        assert alone.startswith("(this machine is not linked to its hub right now: only this machine's sessions")
    finally:
        link.stop()
