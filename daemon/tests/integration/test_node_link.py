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

    def tool(client: Any, bearer: str, tool_name: str, /, **arguments: Any) -> str:
        params = {"name": tool_name, "arguments": arguments}
        body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": params}
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
        deliverer = Running(hub_app.state.team_tasks.run_loop(hub_app.state.bus))  # the hub's: it alone sends
        _until(lambda: hub_app.state.team_tasks._wake is not None)
        sent = tool(node_mcp, token, "send_task", to="research", text="Spec is ready for review?")
        by_project = tool(node_mcp, token, "send_task", to="RESEARCH@shop", text="And the docs?")  # resolved on the hub
        deliverer.stop()
        assert by_project.startswith(f"Delivered to research (research, {research.id})"), by_project
        assert sent.startswith(f"Delivered to research (research, {research.id})")
        pane = next(
            p for t, p in hub_app.state.sessions.tmux.panes.items() if p.info.session_name == research.tmux_session
        )
        assert any(f"[muxtower task from worker (worker) · mac~{worker.id}]" in text for _, text in pane.sent)

        # A session on another machine: reached through the hub, as the node's own session.
        typed = tool(node_mcp, token, "send_message", session_id=research.id, text="Look at the spec")
        assert typed.startswith("Typed into research directly")
        assert any(
            text == f"[muxtower message from worker (worker) · mac~{worker.id}]\nLook at the spec"
            for _, text in pane.sent
        )
        assert tool(node_mcp, token, "read_session", session_id=research.id).startswith(research.id)
        assert tool(node_mcp, token, "watch_session", session_id=research.id).startswith("Watching research")
        assert hub_app.state.mcp.tools["watch_session"] is not None
        assert research.id in tool(node_mcp, token, "list_sessions")  # linked: every machine's sessions

        # The watched session's events reach the node's session (typed in there), and list_events has them.
        hub_pane = next(
            p for p in hub_app.state.sessions.tmux.panes.values() if p.info.session_name == research.tmux_session
        )
        hooked = {"Authorization": f"Bearer {hub_pane.env['MUXTOWER_HOOK_TOKEN']}", "X-Muxtower-Session": research.id}
        stop = {"hook_event_name": "Stop", "last_assistant_message": "Spec reviewed."}
        assert hub_mcp.post("/v1/hooks/claude-code", json=stop, headers=hooked).status_code == 200
        hub_app.state.watches.updates()
        hub_app.state.watches.deliver()
        node_pane = next(p for p in node_tmux.panes.values() if p.info.session_name == worker.tmux_session)
        _until(lambda: any("[muxtower event" in text and "research" in text for _, text in node_pane.sent))
        assert "research" in tool(node_mcp, token, "list_events", after=0)

        # Started on another machine, renamed and archived there: through the hub too.
        started = tool(node_mcp, token, "start_session", cwd=str(work), machine="@nas", name="helper")
        assert started.startswith("Started helper") and not started.startswith("ERROR"), started
        helper = next(s for s in hub_app.state.directory.list() if s.name == "helper")
        assert "~" not in helper.id  # on the hub itself
        assert not tool(node_mcp, token, "rename_session", session_id=helper.id, name="helper 2").startswith("ERROR")
        assert hub_app.state.directory.get(helper.id).name == "helper 2"
        assert not tool(node_mcp, token, "archive_session", session_id=helper.id).startswith("ERROR")

        # The app's groups of projects: kept on the hub, asked through the node too.
        _, phone = node.state.tokens.create("phone")
        on_node = {"Authorization": f"Bearer {phone}"}
        focus = {"groups": [{"id": "focus", "name": "Focus", "projects": ["muxtower", "ha"], "sessions": []}]}
        assert node_mcp.put("/v1/chip-groups", json=focus, headers=on_node).status_code == 200
        assert hub_app.state.chip_groups.load().groups[0].name == "Focus"  # on the hub, not the node
        assert node.state.chip_groups.load().groups == []
        assert node_mcp.get("/v1/chip-groups", headers=on_node).json() == focus

        # Without its hub, the node answers for itself and says so.
        link.stop()
        _until(lambda: not node.state.hub.status().connected)
        alone = tool(node_mcp, token, "my_team")
        assert alone.startswith("NOTE: this machine is a node of the hub") and "try again in a few seconds" in alone
        listed = tool(node_mcp, token, "list_sessions")
        assert listed.startswith("NOTE: this machine is a node") and research.id not in listed  # said why
        away = tool(node_mcp, token, "send_message", session_id=research.id, text="hi")
        assert away.startswith(f"ERROR {research.id} is not on this machine, and its hub cannot be asked now")
    finally:
        link.stop()


def test_the_hub_starts_again_what_a_restart_interrupted_on_a_node(hub: tuple[FastAPI, str], tmp_path: Path) -> None:
    from muxtower.sessions.models import CreateSession

    hub_app, hub_url = hub
    _, device = hub_app.state.tokens.create("phone")
    phone = httpx.Client(base_url=hub_url, headers={"Authorization": f"Bearer {device}"}, timeout=10)
    node_tmux = FakeTmux()
    work = tmp_path / "work"
    work.mkdir()
    before = create_app(_settings(tmp_path, "mac", _free_port()), tmux=node_tmux, run_loops=False)
    started = before.state.sessions.create(CreateSession(runtime="claude", cwd=str(work), name="w", args=["--verbose"]))
    node_tmux.panes.clear()  # the Mac restarted: its tmux server and the daemon with it
    node_tmux.servers["muxtower"] = None
    node = create_app(_settings(tmp_path, "mac", _free_port()), tmux=node_tmux, run_loops=False)
    node.state.monitor.tick()
    assert node.state.sessions.repo.get(started.id).interrupted_at is not None
    link = Running(node.state.hub.run_loop())
    try:
        assert node.state.hub.join(hub_url, hub_app.state.pairing.create_code("phone").code).name == "mac"
        listed = _until(lambda: phone.get("/v1/recovery").json()["sessions"])
        assert [s["id"] for s in listed] == [f"mac~{started.id}"]
        (again,) = phone.post("/v1/recovery", json={"session_ids": [f"mac~{started.id}"]}).json()
        assert again["id"] == f"mac~{started.id}" and again["interrupted_at"] is None
        pane = next(p for p in node_tmux.panes.values() if "--verbose" in p.argv)
        assert pane.info.session_name == f"mxt-{started.id[:8]}"
    finally:
        link.stop()
