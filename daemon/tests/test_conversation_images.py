import dataclasses
import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from muxtower.app import create_app
from muxtower.config import load_settings
from muxtower.errors import Conflict, Invalid, NotFound
from muxtower.nodes.api import NodeApi
from muxtower.nodes.protocol import METHODS
from muxtower.nodes.source import NodeSource
from muxtower.sessions.images import ImageFile, read_image, read_shown, shown_images
from muxtower.sessions.models import ConversationItem, ConversationItemKind
from muxtower.sessions.monitor import Monitor
from tests.fakes import FakeTmux
from tests.test_linking import FakeProcesses
from tests.test_transcripts import line

PNG = b"\x89PNG\r\n\x1a\nnot really"


def test_the_images_an_item_shows() -> None:
    assert shown_images("tool", "Read", "/srv/shots/a.png") == ["/srv/shots/a.png"]
    sent = '{"files": ["/srv/x/before.png", "/srv/x/after.JPG", "/srv/x/notes.md"], "caption": "a.png"}'
    assert shown_images("tool", "SendUserFile", sent) == ["/srv/x/before.png", "/srv/x/after.JPG"]
    reply = "截图在/srv/截图/a.png，对比 (/srv/b.webp) 和 `/srv/b.webp`; not ~/c.png, x/d.png or /e.png.bak"
    assert shown_images("reply", None, reply) == ["/srv/截图/a.png", "/srv/b.webp"]
    assert shown_images("tool", "Bash", "cp /srv/a.png /srv/b.png") == []  # a command's files are not pictures
    assert shown_images("approval", None, "/srv/a.png") == []
    item = ConversationItem(seq=1, kind=ConversationItemKind.REPLY, text="see /srv/a.png")
    assert item.images == ["/srv/a.png"]  # filled in wherever an item is made, a node's too


def test_only_an_image_the_conversation_shows_and_only_here(tmp_path: Path) -> None:
    shot = tmp_path / "shot.png"
    shot.write_bytes(PNG)
    shows = [ConversationItem(seq=1, kind=ConversationItemKind.REPLY, text=f"here: {shot}")]
    assert read_shown(str(shot), shows, here=True).data == PNG
    assert read_shown(str(shot), shows, here=True).media_type == "image/png"
    with pytest.raises(NotFound):
        read_shown(str(tmp_path / "other.png"), shows, here=True)
    with pytest.raises(Conflict):  # the session runs on another machine
        read_shown(str(shot), shows, here=False)
    with pytest.raises(Invalid):
        read_image(str(tmp_path / "secrets.txt"))
    with pytest.raises(NotFound):
        read_image(str(tmp_path / "gone.png"))


def test_a_session_serves_the_images_its_conversation_shows(tmp_path: Path) -> None:
    shot, other = tmp_path / "shot.png", tmp_path / "other.png"
    shot.write_bytes(PNG)
    other.write_bytes(PNG)
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
    client = TestClient(app)
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}
    (listed,) = client.get("/v1/sessions", headers=auth).json()
    url = f"/v1/sessions/{listed['id']}/image"
    items = client.get(f"/v1/sessions/{listed['id']}/conversation", headers=auth).json()["items"]
    assert items[-1]["images"] == [str(shot)]

    got = client.get(url, params={"path": str(shot)}, headers=auth)
    assert got.status_code == 200 and got.content == PNG and got.headers["content-type"] == "image/png"
    assert client.get(url, params={"path": str(other)}, headers=auth).status_code == 404  # not shown
    assert client.get(url, params={"path": "/etc/passwd"}, headers=auth).status_code == 404
    assert client.get(url, params={"path": str(shot)}).status_code == 401


def test_a_nodes_image_crosses_the_link_whole() -> None:
    class Directory:
        def image(self, session_id: str, path: str) -> ImageFile:
            assert (session_id, path) == ("a1", "/Users/me/shot.png")
            return ImageFile("image/png", PNG)

    api = NodeApi(Directory(), None, None, None, None, None)  # type: ignore[arg-type]
    sent = api.handle("image", {"session_id": "a1", "path": "/Users/me/shot.png"})
    assert "image" in METHODS and json.loads(json.dumps(sent)) == sent  # it travels as JSON

    class Calls(NodeSource):
        def _call(self, session_id: str, method: str, params: dict[str, Any] | None = None, timeout: float = 0) -> Any:
            assert (session_id, method, params) == ("mac~a1", "image", {"path": "/Users/me/shot.png"})
            return sent

    hub = Calls.__new__(Calls)
    assert hub.image("mac~a1", "/Users/me/shot.png") == ImageFile("image/png", PNG)
