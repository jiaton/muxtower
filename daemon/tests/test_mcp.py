from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.sessions.models import CreateSession
from tests.fakes import FakeTmux


def _rpc(client: TestClient, auth: dict[str, str], method: str, params: dict[str, Any] | None = None) -> Any:
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    return client.post("/v1/mcp", json=body, headers=auth).json()


def test_mcp_lists_and_calls_tools(app: FastAPI, tmux: FakeTmux) -> None:
    client = TestClient(app)
    _, token = app.state.tokens.create("assistant")
    auth = {"Authorization": f"Bearer {token}"}
    assert client.post("/v1/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "ping"}).status_code == 401

    init = _rpc(client, auth, "initialize", {"protocolVersion": "2025-06-18", "capabilities": {}})
    assert init["result"]["protocolVersion"] == "2025-06-18" and "tools" in init["result"]["capabilities"]
    note = client.post("/v1/mcp", json={"jsonrpc": "2.0", "method": "notifications/initialized"}, headers=auth)
    assert note.status_code == 202
    names = {t["name"] for t in _rpc(client, auth, "tools/list")["result"]["tools"]}
    assert {"list_sessions", "read_session", "send_message", "approve", "start_session"} <= names
    assert "watch_session" not in names  # only with the concierge on

    created = app.state.sessions.create(CreateSession(runtime="claude", cwd="/tmp"))  # noqa: S108
    listed = _rpc(client, auth, "tools/call", {"name": "list_sessions", "arguments": {}})["result"]
    assert created.id in listed["content"][0]["text"] and not listed["isError"]
    assert client.post(f"/v1/sessions/{created.id}/hide", json={"hidden": True}, headers=auth).status_code == 204
    hidden = _rpc(client, auth, "tools/call", {"name": "list_sessions", "arguments": {}})["result"]
    assert created.id not in hidden["content"][0]["text"]  # hidden (or archived): only when asked for all
    every = _rpc(client, auth, "tools/call", {"name": "list_sessions", "arguments": {"all": True}})["result"]
    assert " hidden · " in every["content"][0]["text"]
    assert client.post(f"/v1/sessions/{created.id}/hide", json={"hidden": False}, headers=auth).status_code == 204
    sent = _rpc(
        client, auth, "tools/call", {"name": "send_message", "arguments": {"session_id": created.id, "text": "hi"}}
    )
    assert sent["result"]["content"][0]["text"].startswith("Sent to")
    pane = next(p for p in tmux.panes.values() if p.info.session_name.startswith("mxt-"))
    assert ("text", "hi") in pane.sent
    missing = _rpc(client, auth, "tools/call", {"name": "read_session", "arguments": {"session_id": "nope"}})
    assert missing["result"]["isError"]
    assert _rpc(client, auth, "tools/call", {"name": "nope", "arguments": {}})["error"]["code"] == -32602
    assert _rpc(client, auth, "nope/nope")["error"]["code"] == -32601
