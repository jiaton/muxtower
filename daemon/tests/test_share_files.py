"""Sharing a file with the owner (`share_file`): copied whole when shared, privately, up to the size limit,
kept KEPT_DAYS; only a session can share, into its own conversation, where the call becomes a `shared` item;
served with safe headers and byte ranges; a node's file pulled over the link in small pieces."""

import json
import os
import stat
import time
from collections.abc import Callable
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.agents.codex.rollout import RolloutBuilder
from muxtower.claude_conversation import ConversationBuilder, RawEvent
from muxtower.errors import Invalid, NotFound, TooLarge, Unavailable
from muxtower.nodes.api import NodeApi
from muxtower.nodes.protocol import METHODS
from muxtower.nodes.shared import READ_BYTES
from muxtower.sessions.models import ConversationItemKind as K
from muxtower.sessions.models import CreateSession
from muxtower.shared.items import MARKER, share_result
from muxtower.shared.models import KEPT_DAYS
from muxtower.shared.store import SharedStore
from tests.fakes import FakeTmux
from tests.rc_fakes import assistant
from tests.test_message_sender import _mcp_token
from tests.test_teams import _tool

PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 64
MB = 1024 * 1024


def _store(tmp_path: Path, max_bytes: int = 10 * MB) -> SharedStore:
    return SharedStore(tmp_path / "shared", lambda: max_bytes)


# --- the store ----------------------------------------------------------------------------------


def test_a_shared_file_is_a_private_copy(tmp_path: Path) -> None:
    original = tmp_path / "launch plan.png"
    original.write_bytes(PNG)
    store = _store(tmp_path)
    shared = store.share("s1", original, "the new page")
    assert (shared.name, shared.size, shared.media_type, shared.caption) == (
        "launch plan.png",
        len(PNG),
        "image/png",
        "the new page",
    )
    assert (shared.expires_at - shared.shared_at).days == KEPT_DAYS
    original.write_bytes(b"changed")  # a later change, or delete, of the original does not matter
    original.unlink()
    assert store.read("s1", shared.id, 0, 1000) == PNG
    copy = next((tmp_path / "shared" / "s1").iterdir())
    assert copy.name == f"{shared.id}-launch plan.png" and stat.S_IMODE(copy.stat().st_mode) == 0o600
    assert stat.S_IMODE(copy.parent.stat().st_mode) == 0o700
    assert store.find("s1", shared.id).size == len(PNG)
    with pytest.raises(NotFound):
        store.find("s2", shared.id)  # another session's: not found


def test_a_symlink_is_followed_to_the_file(tmp_path: Path) -> None:
    (tmp_path / "real.txt").write_text("notes")
    (tmp_path / "link.txt").symlink_to(tmp_path / "real.txt")
    shared = _store(tmp_path).share("s1", tmp_path / "link.txt", None)
    assert (shared.name, shared.size, shared.caption) == ("link.txt", 5, None)


def test_what_cannot_be_shared_says_why(tmp_path: Path) -> None:
    store = _store(tmp_path, max_bytes=100)
    with pytest.raises(Invalid, match="no such file"):
        store.share("s1", tmp_path / "missing.png", None)
    with pytest.raises(Invalid, match="not a regular file"):
        store.share("s1", tmp_path, None)
    fifo = tmp_path / "pipe"
    os.mkfifo(fifo)
    with pytest.raises(Invalid, match="not a regular file"):  # refused, not waited on
        store.share("s1", fifo, None)
    big = tmp_path / "clip.mp4"
    big.write_bytes(b"\0" * 101)
    with pytest.raises(TooLarge, match="larger than"):
        store.share("s1", big, None)
    if os.geteuid() != 0:
        secret = tmp_path / "secret.txt"
        secret.write_text("x")
        secret.chmod(0)
        with pytest.raises(Invalid, match="cannot read"):
            store.share("s1", secret, None)
    folder = tmp_path / "shared" / "s1"
    assert not folder.exists() or not list(folder.iterdir())  # nothing half-copied left


def test_a_shared_file_expires_after_kept_days_and_is_pruned(tmp_path: Path) -> None:
    (tmp_path / "a.png").write_bytes(PNG)
    store = _store(tmp_path)
    shared = store.share("s1", tmp_path / "a.png", None)
    path = next((tmp_path / "shared" / "s1").iterdir())
    old = time.time() - KEPT_DAYS * 86_400 - 60
    os.utime(path, (old, old))
    with pytest.raises(NotFound):  # expired: gone at once, even before the prune
        store.find("s1", shared.id)
    store.prune()
    assert not (tmp_path / "shared" / "s1").exists()


# --- the MCP tool -------------------------------------------------------------------------------


def _session(app: FastAPI, tmp_path: Path) -> str:
    created = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="research"))
    return str(created.id)


def test_only_a_session_shares_into_its_own_conversation(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path, auth_for: Callable[[FastAPI], str]
) -> None:
    app = make_app()
    client = TestClient(app)
    sid = _session(app, tmp_path)
    (tmp_path / "shot.png").write_bytes(PNG)
    device = auth_for(app)
    assert _tool(client, device, "share_file", path=str(tmp_path / "shot.png")).startswith("ERROR only a session")

    app.state.directory.mark_read(sid, True)
    said = _tool(client, _mcp_token(tmux, sid), "share_file", path="shot.png", caption="the new page")
    assert said.startswith("Shared shot.png (72 bytes) with the owner") and MARKER in said  # relative: its folder
    shared = json.loads(said.split(MARKER, 1)[1])
    assert shared["caption"] == "the new page"
    assert app.state.directory.get(sid).unread  # as after a finished reply
    served = client.get(f"/v1/sessions/{sid}/shared/{shared['id']}", headers={"Authorization": f"Bearer {device}"})
    assert served.status_code == 200 and served.content == PNG
    with app.state.audit.db.connect() as conn:
        rows = [
            dict(r) for r in conn.execute("SELECT action, session_id, detail FROM audit_log WHERE action = 'share'")
        ]
    assert rows == [{"action": "share", "session_id": sid, "detail": "name=shot.png size=72"}]  # never the content


def test_a_share_that_fails_tells_the_agent_why(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app = make_app(attachments={"max_mb": 1})
    client = TestClient(app)
    sid = _session(app, tmp_path)
    token = _mcp_token(tmux, sid)
    assert _tool(client, token, "share_file", path="/nowhere/x.png").startswith("ERROR no such file")
    (tmp_path / "clip.mp4").write_bytes(b"\0" * (MB + 1))
    assert "larger than 1 MB" in _tool(client, token, "share_file", path=str(tmp_path / "clip.mp4"))


@pytest.fixture
def auth_for() -> Callable[[FastAPI], str]:
    def make(app: FastAPI) -> str:
        _, token = app.state.tokens.create("phone")
        return str(token)

    return make


# --- in the conversation ------------------------------------------------------------------------


def _shared_json(tmp_path: Path) -> str:
    (tmp_path / "shot.png").write_bytes(PNG)
    return share_result(_store(tmp_path).share("s1", tmp_path / "shot.png", "the new page"))


def _result(seq: int, tool_use_id: str, content: Any, error: bool = False) -> RawEvent:
    block = {"type": "tool_result", "tool_use_id": tool_use_id, "content": content, "is_error": error}
    return RawEvent(seq, None, "worker", {"type": "user", "message": {"role": "user", "content": [block]}})


def test_a_share_file_call_becomes_a_shared_item_in_its_place(tmp_path: Path) -> None:
    said = _shared_json(tmp_path)
    b = ConversationBuilder()
    call = {"type": "tool_use", "id": "t1", "name": "mcp__muxtower__share_file", "input": {"path": "shot.png"}}
    other = {"type": "tool_use", "id": "t2", "name": "mcp__elsewhere__share_file", "input": {"path": "x"}}
    failed = {"type": "tool_use", "id": "t3", "name": "mcp__muxtower__share_file", "input": {"path": "y"}}
    b.feed([assistant(1, {"type": "text", "text": "Here it is."}, call, other, failed)])
    tool_seq = next(i.seq for i in b.after(0, 10) if i.tool_name == call["name"])
    b.feed([
        _result(2, "t1", [{"type": "text", "text": said}]),
        _result(3, "t2", said),  # another server's tool of the same name: a tool call
        _result(4, "t3", "ERROR no such file: y", error=True),
    ])  # fmt: skip
    items = b.after(0, 10)
    shared = next(i for i in items if i.kind == K.SHARED)
    assert shared.seq == tool_seq and shared.text == "the new page" and shared.images == []
    assert shared.shared is not None and (shared.shared.name, shared.shared.size) == ("shot.png", len(PNG))
    assert [i.kind for i in items] == [K.REPLY, K.SHARED, K.TOOL, K.TOOL]


def test_a_codex_share_file_call_becomes_a_shared_item(tmp_path: Path) -> None:
    said = _shared_json(tmp_path)

    def line(payload: dict[str, Any]) -> bytes:
        return json.dumps({"timestamp": "2026-01-02T03:04:05Z", "type": "response_item", "payload": payload}).encode()

    for output in (said, json.dumps([{"type": "text", "text": said}])):  # plain, or kept as MCP's JSON
        builder = RolloutBuilder()
        call = {"type": "function_call", "name": "mcp__muxtower__share_file", "call_id": "c1", "arguments": "{}"}
        builder.feed_lines([line(call), line({"type": "function_call_output", "call_id": "c1", "output": output})])
        (item,) = builder.after(0, 10)
        assert item.kind == K.SHARED and item.shared is not None and item.shared.name == "shot.png"


# --- served -------------------------------------------------------------------------------------


@pytest.fixture
def shared_in(app: FastAPI, tmp_path: Path) -> Callable[[str, bytes], tuple[str, str]]:
    sid = _session(app, tmp_path)

    def share(name: str, data: bytes) -> tuple[str, str]:
        (tmp_path / name).write_bytes(data)
        return sid, app.state.directory.share(sid, str(tmp_path / name), None).id

    return share


@pytest.mark.parametrize(
    ("name", "content_type", "disposition"),
    [
        ("shot.png", "image/png", "inline"),
        ("clip.mp4", "video/mp4", "inline"),
        ("clip.webm", "video/webm", "inline"),
        ("report.pdf", "application/pdf", "inline"),
        ("logo.svg", "application/octet-stream", "attachment"),  # could run script: a download
        ("page.html", "application/octet-stream", "attachment"),
        ("notes.txt", "application/octet-stream", "attachment"),
    ],
)
def test_served_with_safe_headers_per_type(
    client: TestClient, auth: dict[str, str], shared_in: Callable[[str, bytes], tuple[str, str]],
    name: str, content_type: str, disposition: str,
) -> None:  # fmt: skip
    sid, file_id = shared_in(name, b"<svg onload=alert(1)>")
    answer = client.get(f"/v1/sessions/{sid}/shared/{file_id}", headers=auth)
    assert answer.status_code == 200 and answer.content == b"<svg onload=alert(1)>"
    assert answer.headers["content-type"] == content_type
    assert answer.headers["content-disposition"] == f"{disposition}; filename*=UTF-8''{name}"
    assert answer.headers["x-content-type-options"] == "nosniff"
    assert answer.headers["content-security-policy"] == "sandbox; default-src 'none'"
    assert answer.headers["accept-ranges"] == "bytes"


def test_a_single_byte_range_is_served(
    client: TestClient, auth: dict[str, str], shared_in: Callable[[str, bytes], tuple[str, str]]
) -> None:
    data = bytes(range(256)) * 4
    sid, file_id = shared_in("clip.mp4", data)
    url = f"/v1/sessions/{sid}/shared/{file_id}"
    part = client.get(url, headers={**auth, "Range": "bytes=10-19"})
    assert part.status_code == 206 and part.content == data[10:20]
    assert part.headers["content-range"] == f"bytes 10-19/{len(data)}" and part.headers["content-length"] == "10"
    tail = client.get(url, headers={**auth, "Range": "bytes=-5"})
    assert tail.status_code == 206 and tail.content == data[-5:]
    rest = client.get(url, headers={**auth, "Range": "bytes=1000-"})
    assert rest.status_code == 206 and rest.content == data[1000:]
    past = client.get(url, headers={**auth, "Range": "bytes=5000-6000"})
    assert past.status_code == 416 and past.headers["content-range"] == f"bytes */{len(data)}"
    several = client.get(url, headers={**auth, "Range": "bytes=0-1,5-6"})  # not taken: the whole file
    assert several.status_code == 200 and several.content == data


def test_unknown_expired_or_unauthorized_is_refused(
    app: FastAPI, client: TestClient, auth: dict[str, str], shared_in: Callable[[str, bytes], tuple[str, str]],
) -> None:  # fmt: skip
    sid, file_id = shared_in("shot.png", PNG)
    assert client.get(f"/v1/sessions/{sid}/shared/{file_id}").status_code == 401
    assert client.get(f"/v1/sessions/{sid}/shared/0123456789abcdef", headers=auth).status_code == 404
    assert client.get(f"/v1/sessions/nope/shared/{file_id}", headers=auth).status_code == 404
    path = next(p for p in (app.state.settings.state_dir / "shared").rglob("*") if p.is_file())
    old = time.time() - KEPT_DAYS * 86_400 - 60
    os.utime(path, (old, old))
    assert client.get(f"/v1/sessions/{sid}/shared/{file_id}", headers=auth).status_code == 404


# --- a node's session -----------------------------------------------------------------------------


def test_a_nodes_file_is_pulled_over_the_link_in_small_pieces(
    make_app: Callable[..., FastAPI], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    node = make_app(state_dir=tmp_path / "node")
    node_sid = _session(node, tmp_path)
    data = os.urandom(2 * MB + 12345)
    (tmp_path / "clip.mp4").write_bytes(data)
    file_id = node.state.directory.share(node_sid, str(tmp_path / "clip.mp4"), None).id
    api = NodeApi(node.state.directory, None, None, None, node.state.audit, None)  # type: ignore[arg-type]
    assert "shared" in METHODS

    frames: list[int] = []
    down = False

    def shared_step(session_id: str, params: dict[str, Any]) -> Any:
        if down:
            raise Unavailable("the link is down")
        answer = api.handle("shared", {"session_id": node_sid, **params})
        frames.append(len(json.dumps(answer)))  # what crosses the link
        return answer

    hub = make_app(state_dir=tmp_path / "hub")
    directory = hub.state.directory
    monkeypatch.setattr(directory, "_on_node", lambda session_id: session_id == "mac~s1")
    session = SimpleNamespace(id="mac~s1", node="mac", offline=False, archived_at=None)
    monkeypatch.setattr(directory, "get", lambda session_id: session)
    monkeypatch.setattr(directory.nodes, "shared_step", shared_step)
    _, token = hub.state.tokens.create("phone")
    client = TestClient(hub)
    url = f"/v1/sessions/mac~s1/shared/{file_id}"
    answer = client.get(url, headers={"Authorization": f"Bearer {token}"})
    assert answer.status_code == 200 and answer.content == data
    assert answer.headers["content-type"] == "video/mp4"
    assert len(frames) > 3 and max(frames) < MB  # never one big frame
    assert READ_BYTES < MB

    part = client.get(url, headers={"Authorization": f"Bearer {token}", "Range": f"bytes={MB}-{MB + 99}"})
    assert part.status_code == 206 and part.content == data[MB : MB + 100]

    session.offline = True
    assert client.get(url, headers={"Authorization": f"Bearer {token}"}).status_code == 409
    session.offline, down = False, True
    assert client.get(url, headers={"Authorization": f"Bearer {token}"}).status_code == 409


def test_an_older_node_has_no_shared_files(
    make_app: Callable[..., FastAPI], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    hub = make_app()
    directory = hub.state.directory
    monkeypatch.setattr(directory, "_on_node", lambda session_id: True)
    monkeypatch.setattr(directory, "get", lambda session_id: SimpleNamespace(id=session_id, node="mac", offline=False))

    def old(session_id: str, params: dict[str, Any]) -> Any:
        raise Invalid("unknown method 'shared'")

    monkeypatch.setattr(directory.nodes, "shared_step", old)
    _, token = hub.state.tokens.create("phone")
    answer = TestClient(hub).get(
        "/v1/sessions/mac~s1/shared/0123456789abcdef", headers={"Authorization": f"Bearer {token}"}
    )
    assert answer.status_code == 404
