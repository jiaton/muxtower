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


def test_codex_sessions_are_told_apart_by_how_muxtower_reaches_them() -> None:
    from datetime import UTC, datetime

    from muxtower.mcp.describe import harness, reached
    from muxtower.runtimes.models import AgentState
    from muxtower.sessions.models import Capabilities, Session, StateSource
    from muxtower.sessions.ports import SessionSource

    caps = Capabilities(screen=False, conversation=True, keys=[], resize=False, terminate=False, rename=False)
    now = datetime.now(UTC)

    def codex(source: SessionSource, origin: str, **over: object) -> Session:
        return Session(
            id="t1", name="web", runtime="codex", cwd="/srv/web", machine="hub", source=source, origin=origin,
            capabilities=caps, state=AgentState.IDLE, state_source=StateSource.REMOTE, matched_rule=None,
            needs_attention=False, pending=None, last_message=None, auto_approve=False, can_auto_approve=False,
            created_at=now, updated_at=now, **over,
        )  # fmt: skip

    shared = codex(SessionSource.CODEX_SHARED, "codex_vscode")
    assert reached(shared, "hub") == "muxtower on hub: in Codex's shared app-server"
    assert harness(shared) == "Codex (VS Code)"
    pane = codex(SessionSource.ADOPTED, "codex_cli", remote_id="t1")
    assert reached(pane, "hub") == "muxtower on hub: found in tmux, also in Codex's shared app-server"


def test_read_session_pages_through_what_is_new() -> None:
    from datetime import UTC, datetime
    from types import SimpleNamespace

    from muxtower.mcp.service import McpTools, ReadArgs
    from muxtower.runtimes.models import AgentState
    from muxtower.sessions.models import (
        Capabilities,
        Conversation,
        ConversationItem,
        ConversationItemKind,
        Session,
        StateSource,
    )  # fmt: skip
    from muxtower.sessions.ports import SessionSource

    caps = Capabilities(screen=False, conversation=True, keys=[], resize=False, terminate=False, rename=False)
    now = datetime.now(UTC)
    session = Session(
        id="s1", name="web", runtime="claude-code", cwd="/srv/web", source=SessionSource.ADOPTED,
        capabilities=caps, state=AgentState.IDLE, state_source=StateSource.HOOK, matched_rule=None,
        needs_attention=False, pending=None, last_message=None, auto_approve=False, can_auto_approve=False,
        created_at=now, updated_at=now,
    )  # fmt: skip
    items = [ConversationItem(seq=n, kind=ConversationItemKind.REPLY, text=f"reply {n}") for n in range(1, 8)]

    def conversation(session_id: str, after: int, limit: int) -> Conversation:
        newer = [i for i in items if i.seq > after]
        return Conversation(session_id=session_id, items=newer[-limit:] if after == 0 else newer[:limit], latest_seq=7)

    directory = SimpleNamespace(get=lambda _id: session, conversation=conversation)
    tools = McpTools(directory, None, None, "hub")  # type: ignore[arg-type]
    page = tools.read_session(ReadArgs(session_id="s1", after=3, items=2))
    assert "Conversation after item 3:\n#4 [reply] reply 4\n#5 [reply] reply 5" in page
    assert page.endswith('More: read_session(session_id="s1", after=5)')
    first = tools.read_session(ReadArgs(session_id="s1", after=0, items=2))
    assert "#1 [reply] reply 1\n#2 [reply] reply 2" in first and first.endswith("after=2)")
    assert "Nothing new after item 7." in tools.read_session(ReadArgs(session_id="s1", after=7))
    assert "Recent conversation:" in tools.read_session(ReadArgs(session_id="s1"))


def test_start_session_starts_on_the_device_it_names() -> None:
    from types import SimpleNamespace

    import pytest

    from muxtower.errors import Conflict, Invalid
    from muxtower.mcp.session_tools import SessionTools, StartArgs

    started: list[CreateSession] = []

    def create(request: CreateSession) -> SimpleNamespace:
        started.append(request)
        return SimpleNamespace(name="web", id="s9", cwd=request.cwd)

    launcher = SimpleNamespace(create=create)
    tools = SessionTools(SimpleNamespace(), launcher, "hub", lambda: ["laptop"])  # type: ignore[arg-type]
    assert tools.start_session(StartArgs(cwd="/srv/web", machine="@Laptop")).endswith("on laptop in /srv/web.")
    assert started[-1].node == "laptop"
    for here in (None, "hub", "HUB", ""):
        tools.start_session(StartArgs(cwd="/srv/web", machine=here))
        assert started[-1].node is None
    with pytest.raises(Invalid, match="one of: hub, laptop"):
        tools.start_session(StartArgs(cwd="/srv/web", machine="phone"))

    def refused(request: CreateSession) -> SimpleNamespace:
        raise Conflict("tmux is not installed here")

    launcher.create = refused
    with pytest.raises(Conflict, match="could not start it on laptop: tmux is not installed here"):
        tools.start_session(StartArgs(cwd="/srv/web", machine="laptop"))
