from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.app import create_app
from muxtower.config import load_settings
from muxtower.infra.db import Database
from muxtower.sessions.marks import SessionMarks, SqliteMarksRepository
from muxtower.sources.remote_control.service import RemoteControlSource
from tests import screens
from tests.fakes import FakeTmux
from tests.rc_fakes import FakeRemoteControl, session

T0 = datetime(2026, 10, 25, 12, 0, tzinfo=UTC)


def marks(tmp_path: Path) -> SessionMarks:
    db = Database(tmp_path / "db.sqlite")
    db.migrate()
    return SessionMarks(SqliteMarksRepository(db))


def test_a_finished_turn_is_unread_until_seen_and_survives_restarts(tmp_path: Path) -> None:
    r = marks(tmp_path)
    assert not r.unread("s", source_unread=False, active_at=T0)
    r.finished("s", T0)
    assert r.unread("s", False, T0)
    r.seen("s", T0 + timedelta(seconds=1))
    assert not r.unread("s", False, T0)
    r.finished("s", T0 + timedelta(minutes=5))
    assert marks(tmp_path).unread("s", False, T0)  # reloaded from SQLite


def test_marked_unread_until_seen_and_the_source_flag_counts_for_newer_activity(tmp_path: Path) -> None:
    r = marks(tmp_path)
    r.seen("s", T0)
    r.mark_unread("s")
    assert r.unread("s", False, T0)
    r.seen("s", T0 + timedelta(minutes=1))
    assert not r.unread("s", False, T0)
    assert not r.unread("s", source_unread=True, active_at=T0)  # its news is older than the last look
    assert r.unread("s", source_unread=True, active_at=T0 + timedelta(minutes=2))
    assert r.unread("never-seen", source_unread=True, active_at=T0)


def test_reading_a_session_clears_it_everywhere(tmp_path: Path, tmux: FakeTmux) -> None:
    port = FakeRemoteControl()
    port.sessions = [session("cse_1", unread=True)]
    source = RemoteControlSource(port, {})
    source.tick()
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False},
    )  # fmt: skip
    app = create_app(settings, tmux=tmux, run_loops=False, remote_control=source)
    client = TestClient(app)
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}

    assert client.get("/v1/sessions/cse_1", headers=auth).json()["unread"] is True
    assert client.post("/v1/sessions/cse_1/read", json={}, headers=auth).status_code == 204
    assert ("mark_read", "cse_1") in port.calls  # the Claude apps see it read too
    assert client.get("/v1/sessions/cse_1", headers=auth).json()["unread"] is False
    client.post("/v1/sessions/cse_1/read", json={"read": False}, headers=auth)
    assert client.get("/v1/sessions/cse_1", headers=auth).json()["unread"] is True
    assert client.post("/v1/sessions/nope/read", json={}, headers=auth).status_code == 404


def test_a_finished_turn_shows_unread_with_its_time(app: FastAPI, client: TestClient, auth: dict[str, str],
                                                  tmux: FakeTmux) -> None:  # fmt: skip
    tmux.add_pane("default", "work", "claude").screen = screens.IDLE
    app.state.monitor.tick()
    (listed,) = client.get("/v1/sessions", headers=auth).json()
    assert listed["unread"] is False and listed["finished_at"] is None
    app.state.directory.marks.finished(listed["id"])
    (listed,) = client.get("/v1/sessions", headers=auth).json()
    assert listed["unread"] is True and listed["finished_at"]


def test_hidden_sessions_are_marked_and_hidden_everywhere(app: FastAPI, client: TestClient, auth: dict[str, str],
                                                          tmux: FakeTmux) -> None:  # fmt: skip
    tmux.add_pane("default", "work", "claude").screen = screens.IDLE
    app.state.monitor.tick()
    (listed,) = client.get("/v1/sessions", headers=auth).json()
    assert client.post(f"/v1/sessions/{listed['id']}/hide", json={}, headers=auth).status_code == 204
    assert client.get("/v1/sessions", headers=auth).json()[0]["hidden"] is True
    assert app.state.push.notify_done(listed["id"]) == 0
    client.post(f"/v1/sessions/{listed['id']}/hide", json={"hidden": False}, headers=auth)
    assert client.get("/v1/sessions", headers=auth).json()[0]["hidden"] is False


def test_pinned_sessions_are_marked_everywhere(app: FastAPI, client: TestClient, auth: dict[str, str],
                                               tmux: FakeTmux) -> None:  # fmt: skip
    tmux.add_pane("default", "work", "claude").screen = screens.IDLE
    app.state.monitor.tick()
    (listed,) = client.get("/v1/sessions", headers=auth).json()
    assert listed["pinned"] is False
    assert client.post(f"/v1/sessions/{listed['id']}/pin", json={}, headers=auth).status_code == 204
    assert client.get("/v1/sessions", headers=auth).json()[0]["pinned"] is True
    assert app.state.directory.marks.repo.load()[listed["id"]].pinned is True  # kept through a restart
    client.post(f"/v1/sessions/{listed['id']}/pin", json={"pinned": False}, headers=auth)
    assert client.get("/v1/sessions", headers=auth).json()[0]["pinned"] is False
