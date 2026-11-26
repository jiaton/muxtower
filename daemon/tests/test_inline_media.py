"""Inline media (contract): what an item says it shows, and the routes the app fetches each one from."""

import dataclasses
from pathlib import Path

from fastapi.testclient import TestClient

from muxtower.app import create_app
from muxtower.config import load_settings
from muxtower.errors import Gone, NotMedia, status_of
from muxtower.nodes.protocol import error_of
from muxtower.nodes.protocol import status_of as link_status
from muxtower.sessions.models import ConversationItem, ConversationItemKind, MediaKind, MediaRef, MediaSource
from muxtower.sessions.monitor import Monitor
from tests.fakes import FakeTmux
from tests.test_linking import FakeProcesses
from tests.test_transcripts import line

PNG = b"\x89PNG\r\n\x1a\nmade up"


def test_an_item_lists_its_media_as_references_never_bytes() -> None:
    item = ConversationItem(seq=1, kind=ConversationItemKind.REPLY, text="see /srv/shots/a.png")
    assert item.media == [MediaRef(source=MediaSource.FILE, kind=MediaKind.IMAGE, path="/srv/shots/a.png")]
    inline = MediaRef(source=MediaSource.INLINE, kind=MediaKind.IMAGE, index=0, media_type="image/png")
    sent = ConversationItem(seq=2, kind=ConversationItemKind.TOOL, tool_name="Read", media=[inline])
    assert sent.model_dump(mode="json")["media"] == [
        {"source": "inline", "kind": "image", "path": None, "index": 0, "media_type": "image/png"}
    ]


def test_gone_and_not_media_have_their_statuses_here_and_over_the_link() -> None:
    assert (status_of(Gone()), status_of(NotMedia())) == (410, 415)
    assert (link_status(Gone()), link_status(NotMedia())) == (410, 415)
    assert isinstance(error_of(410, "gone"), Gone) and isinstance(error_of(415, "no"), NotMedia)


def test_the_media_routes_serve_only_what_the_conversation_shows(tmp_path: Path) -> None:
    shot = tmp_path / "shot.png"
    shot.write_bytes(PNG)
    transcript = tmp_path / "t.jsonl"
    transcript.write_text(line("user", "show me") + line("assistant", f"Here it is: {shot}"))
    tmux = FakeTmux()
    pane = tmux.add_pane("default", "work", "claude")
    pane.info = dataclasses.replace(pane.info, pid=4242)
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False},
    )  # fmt: skip
    app = create_app(settings, tmux=tmux, run_loops=False)
    Monitor(app.state.sessions, FakeProcesses({}, {4242: str(transcript)})).tick()
    _, token = app.state.tokens.create("phone")
    client = TestClient(app, headers={"Authorization": f"Bearer {token}"})
    (listed,) = client.get("/v1/sessions").json()
    sid = listed["id"]
    items = client.get(f"/v1/sessions/{sid}/conversation").json()["items"]
    assert items[-1]["media"] == [{"source": "file", "kind": "image", "path": str(shot), "index": None,
                                   "media_type": None}]  # fmt: skip

    got = client.get(f"/v1/sessions/{sid}/media", params={"path": str(shot)})
    assert got.status_code == 200 and got.content == PNG and got.headers["content-type"] == "image/png"
    assert got.headers["content-security-policy"] == "sandbox; default-src 'none'"
    assert got.headers["x-content-type-options"] == "nosniff"
    assert client.get(f"/v1/sessions/{sid}/media", params={"path": "/etc/passwd"}).status_code == 404
    assert client.get(f"/v1/sessions/{sid}/items/{items[-1]['seq']}/media/0").status_code == 404
    assert TestClient(app).get(f"/v1/sessions/{sid}/media", params={"path": str(shot)}).status_code == 401
