"""A Remote Control session on its own whose conversation a node's session runs now is folded into that
session through the link: the hub asks the node (`carries`), which reads its own transcripts. Made-up
transcripts and bridges; a hub served by uvicorn and a node on its own event loop (`test_node_link.py`)."""

import dataclasses
import json
import threading
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
import uvicorn
from fastapi import FastAPI

from muxtower.app import create_app
from muxtower.errors import Invalid
from muxtower.sessions.claude_processes import ClaudeProcesses
from muxtower.sessions.former_bridges import FormerBridges
from muxtower.sessions.monitor import Monitor
from muxtower.sources.remote_control.service import RemoteControlSource
from tests.fakes import FakeTmux
from tests.integration.test_node_link import Running, _free_port, _settings, _until
from tests.rc_fakes import FakeRemoteControl, session
from tests.test_former_bridges import Panes, _events

FIRST = "f1f1f1f1-0000-4000-8000-000000000001"  # the conversation the node's pane runs now
TWIN = "f4f4f4f4-0000-4000-8000-000000000004"  # one that runs both here and on the node
MAC_NOW = "0c0c0c0c-0000-4000-8000-000000000003"
MAC_TWIN = "0d0d0d0d-0000-4000-8000-000000000004"
HUB_TWIN = "0e0e0e0e-0000-4000-8000-000000000005"


def _transcript(claude: Path, agent_id: str, first: str) -> str:
    folder = claude / "projects" / "-home-dev-shop"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{agent_id}.jsonl"
    path.write_text(json.dumps({"type": "user", "uuid": first, "sessionId": agent_id}) + "\n")
    return str(path)


def _pane(tmux: FakeTmux, name: str, pid: int) -> None:
    pane = tmux.add_pane("default", name, "claude")
    pane.info = dataclasses.replace(pane.info, pid=pid)


@pytest.fixture
def hub(tmp_path: Path) -> Iterator[tuple[FastAPI, str, RemoteControlSource]]:
    port = FakeRemoteControl()
    port.sessions = [  # run nowhere now: on their own
        session("cse_ORPHAN", title="shop checkout", environment_id=None, created_at="2026-11-01T09:00:00Z"),
        session("cse_TWIN", title="shop billing", environment_id=None, created_at="2026-11-02T09:00:00Z"),
    ]
    port.events = {
        "cse_ORPHAN": _events(FIRST, "2026-11-01T09:00:00Z"),
        "cse_TWIN": _events(TWIN, "2026-11-02T09:00:00Z"),
    }
    source = RemoteControlSource(port, {})
    source.tick()
    tmux = FakeTmux()
    _pane(tmux, "billing", 5151)  # the twin's conversation runs here too
    number = _free_port()
    app = create_app(_settings(tmp_path, "nas", number), tmux=tmux, run_loops=False, remote_control=source)
    Monitor(app.state.sessions, Panes({5151: _transcript(tmp_path / "hub-claude", HUB_TWIN, TWIN)})).tick()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=number, log_level="warning", lifespan="off"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    _until(lambda: server.started)
    yield app, f"http://127.0.0.1:{number}", source
    server.should_exit = True
    thread.join(5)


def test_a_node_s_session_takes_the_earlier_bridge_of_its_conversation(
    hub: tuple[FastAPI, str, RemoteControlSource], tmp_path: Path
) -> None:
    hub_app, hub_url, source = hub
    _, token = hub_app.state.tokens.create("phone")
    phone = httpx.Client(base_url=hub_url, headers={"Authorization": f"Bearer {token}"}, timeout=10)

    node_tmux = FakeTmux()
    _pane(node_tmux, "checkout", 4242)
    _pane(node_tmux, "billing", 4343)
    node = create_app(_settings(tmp_path, "mac", _free_port()), tmux=node_tmux, run_loops=False)
    claude = tmp_path / "mac-claude"
    transcripts = {4242: _transcript(claude, MAC_NOW, FIRST), 4343: _transcript(claude, MAC_TWIN, TWIN)}
    Monitor(node.state.sessions, Panes(transcripts)).tick()
    node.state.hub.api.processes = ClaudeProcesses(claude)  # its transcripts, not the machine's own
    link = Running(node.state.hub.run_loop())
    try:
        code = hub_app.state.pairing.create_code("phone").code
        assert node.state.hub.join(hub_url, code).name == "mac"

        def on_node() -> dict[str, str] | None:
            found = {s["name"]: s["id"] for s in phone.get("/v1/sessions").json() if s.get("node") == "mac"}
            return found if len(found) == 2 else None

        ids = _until(on_node)
        listed = {s["id"] for s in phone.get("/v1/sessions").json()}
        assert {"cse_ORPHAN", "cse_TWIN"} <= listed  # on their own until found

        nodes = hub_app.state.node_sessions
        passes = FormerBridges(
            hub_app.state.directory, source.firsts, ClaudeProcesses(tmp_path / "hub-claude").carries,
            nodes=nodes.carrying,
        )  # fmt: skip
        # cse_TWIN's conversation runs here and on the node: neither takes it.
        assert passes.tick() == {"cse_ORPHAN": ids["checkout"]}
        assert ids["checkout"].startswith("mac~")
        listed = {s["id"] for s in phone.get("/v1/sessions").json()}
        assert "cse_ORPHAN" not in listed and {"cse_TWIN", ids["checkout"]} <= listed
        assert hub_app.state.sessions.repo.remote_ids()["cse_ORPHAN"] == ids["checkout"]
        assert phone.get("/v1/sessions/cse_ORPHAN").json()["id"] == ids["checkout"]
        assert passes.tick() == {}  # the twin stays on its own

        # An older node knows no `carries`: it tells nothing, and nothing fails.
        handle = node.state.hub.api.handle

        def older(method: str, params: dict[str, Any]) -> Any:
            if method == "carries":
                raise Invalid(f"unknown method {method}")
            return handle(method, params)

        node.state.hub.api.handle = older
        assert nodes.carrying([FIRST, TWIN]) == {}
        node.state.hub.api.handle = handle
        assert nodes.carrying([TWIN]) == {TWIN: [ids["billing"]]}

        # Offline: not asked.
        link.stop()
        _until(lambda: not hub_app.state.nodes.node("mac").online)
        assert nodes.carrying([FIRST, TWIN]) == {}
        listed = {s["id"] for s in phone.get("/v1/sessions").json()}
        assert "cse_ORPHAN" not in listed  # still folded into its session, listed offline
    finally:
        link.stop()
