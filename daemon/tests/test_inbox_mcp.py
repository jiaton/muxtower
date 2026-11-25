"""The Inbox's MCP tools are the concierge's alone: listed to it and callable by it, while every other
session's tools/list stays byte for byte what it was, and their calls are refused. A node lists them to no
one (the concierge runs on the hub). Made-up data only."""

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.sessions.models import CreateSession
from tests.fakes import FakeTmux

INBOX_TOOLS = {"read_inbox", "add_inbox_item", "update_inbox_item", "close_inbox_item", "hand_inbox_item"}


def _rpc(client: TestClient, token: str, method: str, params: dict[str, Any] | None = None) -> Any:
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    return client.post("/v1/mcp", json=body, headers={"Authorization": f"Bearer {token}"})


def _call(client: TestClient, token: str, name: str, **arguments: Any) -> Any:
    return _rpc(client, token, "tools/call", {"name": name, "arguments": arguments}).json()


def _text(reply: Any) -> str:
    return str(reply["result"]["content"][0]["text"])


def _token_of(tmux: FakeTmux, tmux_session: str | None = None) -> str:
    pane = next(
        p for p in tmux.panes.values()
        if (p.info.session_name == tmux_session if tmux_session else "--mcp-config" in p.argv)
    )  # fmt: skip
    config = json.load(open(pane.argv[pane.argv.index("--mcp-config") + 1]))["mcpServers"]["muxtower"]
    return str(config["headers"]["Authorization"].removeprefix("Bearer "))


def _hub(make_app: Callable[..., FastAPI], tmp_path: Path, tmux: FakeTmux) -> tuple[FastAPI, str, str, str]:
    """A hub with a concierge and one ordinary session: the app, the concierge's token, the session's, its id."""
    app = make_app(**{"concierge.enabled": True, "concierge.cwd": tmp_path / "home"})
    assert app.state.concierge.ensure() is True
    concierge = _token_of(tmux)
    worker = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="worker"))
    return app, concierge, _token_of(tmux, worker.tmux_session), str(worker.id)


def test_another_sessions_tools_list_is_unchanged_byte_for_byte(
    make_app: Callable[..., FastAPI], tmp_path: Path, tmux: FakeTmux
) -> None:
    app, concierge, worker, _ = _hub(make_app, tmp_path, tmux)
    client = TestClient(app)
    _, device = app.state.tokens.create("phone")
    with_inbox = {t: _rpc(client, t, "tools/list").content for t in (worker, device)}
    initialized = _rpc(client, worker, "initialize", {"protocolVersion": "2025-06-18"}).content

    app.state.mcp.concierge_tools = {}  # muxtower as it was before the Inbox
    assert _rpc(client, worker, "tools/list").content == with_inbox[worker]
    assert _rpc(client, device, "tools/list").content == with_inbox[device]
    assert _rpc(client, worker, "initialize", {"protocolVersion": "2025-06-18"}).content == initialized
    assert not INBOX_TOOLS & {t["name"] for t in json.loads(with_inbox[worker])["result"]["tools"]}
    assert not INBOX_TOOLS & {t["name"] for t in json.loads(with_inbox[device])["result"]["tools"]}
    assert not any(b"inbox" in body.lower() for body in with_inbox.values())

    concierges = json.loads(_rpc(client, concierge, "tools/list").content)["result"]["tools"]
    assert not INBOX_TOOLS & {t["name"] for t in concierges}  # cleared above: everyone's tools only
    assert len(concierges) == len(json.loads(with_inbox[worker])["result"]["tools"])


def test_the_concierge_alone_lists_and_calls_them(
    make_app: Callable[..., FastAPI], tmp_path: Path, tmux: FakeTmux
) -> None:
    app, concierge, worker, worker_id = _hub(make_app, tmp_path, tmux)
    client = TestClient(app)
    listed = {t["name"]: t for t in _rpc(client, concierge, "tools/list").json()["result"]["tools"]}
    assert INBOX_TOOLS <= listed.keys()
    assert "记一下" in listed["add_inbox_item"]["description"]
    assert listed["hand_inbox_item"]["description"].startswith("Only when the owner asks you to")

    for token in (worker, app.state.tokens.create("phone")[1]):  # anyone else: refused, as an unknown tool
        refused = _call(client, token, "read_inbox")
        assert refused["error"]["code"] == -32602 and "unknown tool" in refused["error"]["message"]
        assert _call(client, token, "add_inbox_item", text="x")["error"]["code"] == -32602
    assert app.state.inbox.inbox().items == []

    assert _text(_call(client, concierge, "read_inbox")) == "The Inbox is empty."
    added = _text(_call(client, concierge, "add_inbox_item", text="Compare two payment providers", project="acme/shop"))
    item = app.state.inbox.inbox().items[0]
    assert added == f"Added #{item.id} v1 · open · acme/shop: Compare two payment providers"
    assert (
        _text(_call(client, concierge, "read_inbox"))
        == f"#{item.id} v1 · open · acme/shop: Compare two payment providers"
    )

    # The owner edits it after the concierge read it: the concierge's edit is refused, with the item now.
    owner = client.patch(
        f"/v1/inbox/{item.id}", json={"text": "Compare three providers", "if_version": 1},
        headers={"Authorization": f"Bearer {app.state.tokens.create('tablet')[1]}"},
    )  # fmt: skip
    assert owner.status_code == 200
    late = _call(client, concierge, "update_inbox_item", id=item.id, if_version=1, text="Compare providers")
    assert late["result"]["isError"] and "Compare three providers" in _text(late) and " v2 " in _text(late)
    moved = _call(client, concierge, "update_inbox_item", id=item.id, if_version=2, project=None)
    assert _text(moved) == f"Now #{item.id} v3 · open: Compare three providers"

    app.state.teams.set_project(worker_id, "acme/shop")
    app.state.teams.set_role(worker_id, "builder", None)
    handed = _call(client, concierge, "hand_inbox_item", id=item.id, project="acme/shop", role="Builder")
    assert _text(handed).startswith(f"Handed #{item.id} v4 · handed · handed to builder")
    [task] = app.state.team_tasks.repo.held()
    assert task.to_id == worker_id and task.from_label == "the owner's Inbox"
    nobody = _call(client, concierge, "hand_inbox_item", id=item.id, project="acme/shop", role="tester")
    assert nobody["result"]["isError"] and _text(nobody) == "no one in acme/shop holds tester"

    closed = _call(client, concierge, "close_inbox_item", id=item.id, if_version=4)
    assert "· done" in _text(closed) and app.state.inbox.inbox().items == []
    with app.state.audit.db.connect() as conn:
        actions = [r["action"] for r in conn.execute("SELECT action FROM audit_log WHERE action LIKE 'mcp:%inbox%'")]
    assert "mcp:add_inbox_item" in actions and "mcp:hand_inbox_item" in actions


def test_on_a_node_no_session_sees_them(make_app: Callable[..., FastAPI], tmp_path: Path, tmux: FakeTmux) -> None:
    app, concierge, _, _ = _hub(make_app, tmp_path, tmux)
    client = TestClient(app)
    app.state.mcp.is_node = lambda: True
    assert not INBOX_TOOLS & {t["name"] for t in _rpc(client, concierge, "tools/list").json()["result"]["tools"]}
    assert _call(client, concierge, "read_inbox")["error"]["code"] == -32602
