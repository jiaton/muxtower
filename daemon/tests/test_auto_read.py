"""Auto-read: a session whose finished turns are marked read as they end (a chatty worker), while what needs
the owner still shows. Kept on the hub with the other marks, through restarts; the read goes on to a node."""

from pathlib import Path
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.sessions.owner_marks import OwnerMarks
from tests import screens
from tests.fakes import FakeTmux
from tests.test_marks import marks as _marks


def _one(client: TestClient, auth: dict[str, str]) -> dict[str, Any]:
    (listed,) = client.get("/v1/sessions", headers=auth).json()
    return listed  # type: ignore[no-any-return]


def test_a_finished_turn_stays_read_and_needs_you_still_shows(
    app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux
) -> None:
    pane = tmux.add_pane("default", "work", "claude")
    pane.screen = screens.IDLE
    app.state.monitor.tick()
    sid = _one(client, auth)["id"]
    assert _one(client, auth)["auto_read"] is False
    answer = client.put(f"/v1/sessions/{sid}/auto-read", json={"auto_read": True}, headers=auth)
    assert answer.status_code == 200 and answer.json()["auto_read"] is True

    app.state.directory.turn_finished(sid)
    listed = _one(client, auth)
    assert listed["unread"] is False and listed["finished_at"]
    assert app.state.push.notify_done(sid) == 0  # nothing to clear later: it is settled already

    pane.screen = screens.PERMISSION  # what needs the owner is its state, not read state
    app.state.monitor.tick()
    listed = _one(client, auth)
    assert listed["needs_attention"] is True and listed["unread"] is False

    client.post(f"/v1/sessions/{sid}/read", json={"read": False}, headers=auth)  # marked by hand: holds
    app.state.directory.turn_finished(sid)
    assert _one(client, auth)["unread"] is True


def test_turned_off_a_finished_turn_is_unread_again(
    app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux
) -> None:
    tmux.add_pane("default", "work", "claude").screen = screens.IDLE
    app.state.monitor.tick()
    sid = _one(client, auth)["id"]
    client.put(f"/v1/sessions/{sid}/auto-read", json={"auto_read": True}, headers=auth)
    app.state.directory.turn_finished(sid)
    client.put(f"/v1/sessions/{sid}/auto-read", json={"auto_read": False}, headers=auth)
    assert _one(client, auth)["unread"] is False  # what was read stays read
    app.state.directory.turn_finished(sid)
    assert _one(client, auth)["unread"] is True


def test_it_survives_a_restart(tmp_path: Path) -> None:
    r = _marks(tmp_path)
    r.set_auto_read("s", True)
    reloaded = _marks(tmp_path)
    assert reloaded.get("s").auto_read is True
    assert reloaded.turn_finished("s") is True
    finished = reloaded.get("s").finished_at
    assert finished and not reloaded.unread("s", source_unread=True, active_at=finished)


def test_a_node_sessions_turn_read_is_passed_on(tmp_path: Path) -> None:
    """A node keeps marks of its own and says unread by them: the hub's read at the turn's end goes to it
    (and to the Remote Control session it carries), as a read by hand does."""

    class Source:
        def __init__(self) -> None:
            self.read: list[str] = []

        def get(self, session_id: str) -> Any:
            return SimpleNamespace(unread=session_id not in self.read)

        def mark_read(self, session_id: str) -> None:
            self.read.append(session_id)

    node, rc = Source(), Source()
    listed = SimpleNamespace(id="mac~abc", remote_id="cse_01X")

    class Directory(OwnerMarks):
        def get(self, session_id: str) -> Any:
            return listed

        def source_of(self, session_id: str) -> Any:
            return rc if session_id.startswith("cse_") else node

    directory = Directory()
    directory.marks = _marks(tmp_path)
    directory.turn_finished("mac~abc")  # not auto-read: unread, nothing passed on
    assert node.read == [] and rc.read == []
    directory.set_auto_read("mac~abc", True)
    directory.turn_finished("mac~abc")
    assert node.read == ["mac~abc"] and rc.read == ["cse_01X"]
    finished = directory.marks.get("mac~abc").finished_at
    assert finished and not directory.marks.unread("mac~abc", source_unread=True, active_at=finished)
