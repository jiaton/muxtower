"""Files attached to a message: uploaded to the session's machine, written as they arrive, pasted into its
pane as their paths after any pictures; refused past the size limit, for an unknown id, and for a session
with no pane here (Remote Control only: pictures only); pruned after KEPT_DAYS."""

import base64
import os
import stat
import time
from pathlib import Path
from urllib.parse import quote

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.app import create_app
from muxtower.attachments.models import FILENAME_HEADER, KEPT_DAYS
from muxtower.attachments.store import MAX_NAME_BYTES, AttachmentStore, safe_name
from muxtower.config import load_settings
from muxtower.sources.remote_control.service import RemoteControlSource
from muxtower.terminal import service as terminal_service
from tests.fakes import FakePane, FakeTmux
from tests.rc_fakes import FakeRemoteControl, session

NOTES = b"line one\nline two\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 32
IMAGE = {"media_type": "image/png", "data": base64.b64encode(PNG).decode()}


def _upload(
    client: TestClient, auth: dict[str, str], sid: str, name: str, body: bytes = NOTES, media: str = "text/plain"
) -> httpx.Response:
    headers = {**auth, FILENAME_HEADER: quote(name), "Content-Type": media}
    answer: httpx.Response = client.post(f"/v1/sessions/{sid}/attachments", content=body, headers=headers)
    return answer


def _pane_session(app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux) -> tuple[str, FakePane]:
    pane = tmux.add_pane("default", "work", "claude")
    app.state.monitor.tick()
    return client.get("/v1/sessions", headers=auth).json()[0]["id"], pane


def test_an_uploaded_file_is_saved_privately_and_pasted_as_its_path_after_the_pictures(
    app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(terminal_service, "PASTE_SECONDS", 0)
    sid, pane = _pane_session(app, client, auth, tmux)
    answer = _upload(client, auth, sid, "plan for the launch.md", media="text/markdown")
    assert answer.status_code == 201
    found = answer.json()
    saved = Path(found["path"])
    assert found["name"] == f"{found['id']}-plan for the launch.md" and saved.name == found["name"]
    assert (found["size"], found["media_type"]) == (len(NOTES), "text/markdown")
    assert saved.read_bytes() == NOTES and stat.S_IMODE(saved.stat().st_mode) == 0o600
    assert stat.S_IMODE(saved.parent.stat().st_mode) == 0o700
    assert stat.S_IMODE(saved.parent.parent.stat().st_mode) == 0o700
    assert not [p for p in saved.parent.iterdir() if p.name.startswith(".")]  # nothing left half-written

    body = {"text": "read these", "enter": True, "images": [IMAGE], "attachments": [found["id"]]}
    assert client.post(f"/v1/sessions/{sid}/input", json=body, headers=auth).status_code == 204
    (k1, image), (k2, file), *rest = pane.sent
    assert (k1, k2) == ("paste", "paste") and image.endswith(".png") and file == f"{saved}\n"
    assert rest == [("text", "read these"), ("key", "Enter")]

    with app.state.audit.db.connect() as conn:
        rows = conn.execute("SELECT detail FROM audit_log WHERE action = 'attachment'").fetchall()
    assert [r["detail"] for r in rows] == [f"name={found['name']} size={len(NOTES)}"]  # never the content


def test_a_utf8_name_arrives_percent_encoded(
    app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux
) -> None:
    sid, _ = _pane_session(app, client, auth, tmux)
    found = _upload(client, auth, sid, "计划 ü.txt").json()
    assert found["name"].endswith("-计划 ü.txt")


def test_past_the_limit_is_413_and_nothing_is_kept(
    app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux
) -> None:
    sid, _ = _pane_session(app, client, auth, tmux)
    store: AttachmentStore = app.state.terminal.attachments
    store.max_bytes = lambda: 10
    assert _upload(client, auth, sid, "big.bin", b"x" * 11).status_code == 413

    def chunks() -> object:  # no Content-Length: stopped while it streams
        yield b"x" * 6
        yield b"x" * 6

    headers = {**auth, FILENAME_HEADER: "big.bin"}
    assert client.post(f"/v1/sessions/{sid}/attachments", content=chunks(), headers=headers).status_code == 413
    assert not [p for p in store.directory.rglob("*") if p.is_file()]
    assert _upload(client, auth, sid, "small.bin", b"x" * 10).status_code == 201


def test_the_limit_is_a_setting(make_app: object) -> None:
    app = make_app()  # type: ignore[operator]
    assert app.state.terminal.attachments.max_bytes() == 25 * 1024 * 1024
    app.state.feature_settings.change({"attachments.max_mb": 2}, "phone")
    assert app.state.terminal.attachments.max_bytes() == 2 * 1024 * 1024


@pytest.mark.parametrize(
    ("given", "kept"),
    [
        ("../../x", "x"),
        ("..\\..\\boot.ini", "boot.ini"),
        ("/etc/passwd", "passwd"),
        ("..", "file"),
        ("...", "file"),
        ("", "file"),
        (".hidden.txt", "hidden.txt"),
        ("a\x00b\x1b[31m‮c.txt", "ab[31mc.txt"),
        ("report.pdf", "report.pdf"),
    ],
)
def test_names_are_made_safe(given: str, kept: str) -> None:
    assert safe_name(given) == kept


def test_a_long_name_keeps_its_extension_within_120_bytes() -> None:
    name = safe_name("é" * 200 + ".tar")
    assert name.endswith("é.tar") and len(name.encode()) <= MAX_NAME_BYTES


def test_a_traversing_name_stays_in_the_session_s_folder(
    app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux
) -> None:
    sid, _ = _pane_session(app, client, auth, tmux)
    first = _upload(client, auth, sid, "../../x").json()
    second = _upload(client, auth, sid, "../../x").json()
    folder = app.state.terminal.attachments.directory
    for found in (first, second):
        assert Path(found["path"]).parent.parent == folder and found["name"] == f"{found['id']}-x"
    assert first["path"] != second["path"]  # the same name twice: two files


def test_an_unknown_id_is_409_and_nothing_is_typed(
    app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux
) -> None:
    sid, pane = _pane_session(app, client, auth, tmux)
    for wanted in ("0123abcd", "../../etc"):
        body = {"text": "read it", "enter": True, "attachments": [wanted]}
        assert client.post(f"/v1/sessions/{sid}/input", json=body, headers=auth).status_code == 409
    assert pane.sent == []
    other = tmux.add_pane("default", "other", "claude")
    app.state.monitor.tick()
    other_sid = next(s["id"] for s in client.get("/v1/sessions", headers=auth).json() if s["id"] != sid)
    found = _upload(client, auth, other_sid, "notes.txt").json()
    body = {"text": "read it", "enter": True, "attachments": [found["id"]]}  # another session's file
    assert client.post(f"/v1/sessions/{sid}/input", json=body, headers=auth).status_code == 409
    assert other.sent == []


def test_a_remote_control_only_session_takes_pictures_only(tmp_path: Path) -> None:
    port = FakeRemoteControl()
    port.sessions = [session("cse_1")]
    source = RemoteControlSource(port, {})
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"state_dir": tmp_path / "state", "config_dir": tmp_path / "config", "serve_ui": False},
    )  # fmt: skip
    app = create_app(settings, tmux=FakeTmux(), run_loops=False, remote_control=source)
    source.tick()
    client = TestClient(app)
    auth = {"Authorization": f"Bearer {app.state.tokens.create('phone')[1]}"}
    answer = _upload(client, auth, "cse_1", "notes.txt")
    assert answer.status_code == 409 and answer.json()["detail"] == "this session takes pictures only"
    body = {"text": "read it", "attachments": ["0123abcd"]}
    assert client.post("/v1/sessions/cse_1/input", json=body, headers=auth).status_code == 409
    assert (
        client.post("/v1/sessions/cse_1/input", json={"text": "look", "images": [IMAGE]}, headers=auth).status_code
        == 204
    )
    assert not (tmp_path / "state" / "attachments").exists()


def test_files_older_than_kept_days_are_pruned(tmp_path: Path) -> None:
    store = AttachmentStore(tmp_path / "attachments", lambda: 1000)
    old = store.begin("acme1", "old.txt", "text/plain")
    old.write(b"old")
    kept_old = Path(old.finish().path)
    fresh = store.begin("acme2", "new.txt", "text/plain")
    fresh.write(b"new")
    kept_new = Path(fresh.finish().path)
    long_ago = time.time() - KEPT_DAYS * 86_400 - 60
    os.utime(kept_old, (long_ago, long_ago))
    store.prune()
    assert not kept_old.exists() and not kept_old.parent.exists()  # its folder too, once empty
    assert kept_new.read_bytes() == b"new"
