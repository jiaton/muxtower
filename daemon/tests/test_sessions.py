from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests import screens
from tests.fakes import FakeTmux


def test_create_list_rename_terminate(client: TestClient, auth: dict[str, str], tmux: FakeTmux, tmp_path: Path) -> None:
    res = client.post(
        "/v1/sessions", json={"runtime": "claude-code", "cwd": str(tmp_path), "name": "api"}, headers=auth
    )
    session_id = res.json()["id"]
    assert [s["name"] for s in client.get("/v1/sessions", headers=auth).json()] == ["api"]

    renamed = client.patch(f"/v1/sessions/{session_id}", json={"name": "backend"}, headers=auth)
    assert renamed.json()["name"] == "backend"
    assert client.delete(f"/v1/sessions/{session_id}", headers=auth).status_code == 204
    assert client.get("/v1/sessions", headers=auth).json() == [] and tmux.panes == {}


def test_create_rejects_unknown_runtime_and_bad_cwd(client: TestClient, auth: dict[str, str], tmp_path: Path) -> None:
    assert client.post("/v1/sessions", json={"runtime": "vim", "cwd": str(tmp_path)}, headers=auth).status_code == 400
    assert client.post("/v1/sessions", json={"runtime": "claude", "cwd": "/no/such"}, headers=auth).status_code == 400


def test_monitor_adopts_agents_and_reaps_gone_panes(app: FastAPI, client: TestClient, auth: dict[str, str],
                                                    tmux: FakeTmux) -> None:  # fmt: skip
    pane = tmux.add_pane("default", "work", "claude")
    tmux.add_pane("default", "editor", "vim")
    pane.screen = screens.QUESTION
    result = app.state.monitor.tick()
    sessions = client.get("/v1/sessions", headers=auth).json()
    assert [s["name"] for s in sessions] == ["work"]
    assert sessions[0]["source"] == "adopted" and sessions[0]["state"] == "needs_answer"
    assert result.attention == [sessions[0]["id"]]

    # Adopted sessions are never killed by muxtower.
    assert client.delete(f"/v1/sessions/{sessions[0]['id']}", headers=auth).status_code == 409
    del tmux.panes[("default", pane.info.pane_id)]
    app.state.monitor.tick()
    assert client.get("/v1/sessions", headers=auth).json() == []


def test_input_validation(app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux) -> None:
    pane = tmux.add_pane("default", "work", "claude")
    app.state.monitor.tick()
    sid = client.get("/v1/sessions", headers=auth).json()[0]["id"]
    assert client.post(f"/v1/sessions/{sid}/input", json={"text": "hi", "enter": True}, headers=auth).status_code == 204
    assert client.post(f"/v1/sessions/{sid}/input", json={"key": "C-c"}, headers=auth).status_code == 204
    assert client.post(f"/v1/sessions/{sid}/input", json={"key": "; rm -rf /"}, headers=auth).status_code == 422
    assert client.post(f"/v1/sessions/{sid}/input", json={}, headers=auth).status_code == 422
    assert pane.sent == [("text", "hi"), ("key", "Enter"), ("key", "C-c")]


def test_auto_approve_needs_a_capable_runtime(app: FastAPI, client: TestClient, auth: dict[str, str],
                                              tmux: FakeTmux) -> None:  # fmt: skip
    tmux.add_pane("default", "a", "claude")
    tmux.add_pane("default", "b", "codex")
    app.state.monitor.tick()
    by_name = {s["name"]: s for s in client.get("/v1/sessions", headers=auth).json()}
    assert client.patch(f"/v1/sessions/{by_name['a']['id']}", json={"auto_approve": True}, headers=auth).json()[
        "auto_approve"
    ]
    assert (
        client.patch(f"/v1/sessions/{by_name['b']['id']}", json={"auto_approve": True}, headers=auth).status_code == 400
    )


def test_unnamed_tmux_sessions_are_named_after_their_directory(app: FastAPI, client: TestClient, auth: dict[str, str],
                                                               tmux: FakeTmux) -> None:  # fmt: skip
    tmux.add_pane("default", "0", "claude", cwd="/home/me/code/api")
    tmux.add_pane("default", "work", "claude", cwd="/home/me/code/web")
    app.state.monitor.tick()
    names = sorted(s["name"] for s in client.get("/v1/sessions", headers=auth).json())
    assert names == ["api", "work"]


def test_renamed_tmux_session_is_still_the_same_session(
    app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux
) -> None:
    from dataclasses import replace

    pane = tmux.add_pane("default", "0", "claude", cwd="/srv/app")
    app.state.monitor.tick()
    before = client.get("/v1/sessions", headers=auth).json()[0]["id"]
    pane.info = replace(pane.info, session_name="renamed")
    app.state.monitor.tick()
    assert [s["id"] for s in client.get("/v1/sessions", headers=auth).json()] == [before]


def test_resize_keeps_room_for_dialogs(
    client: TestClient, auth: dict[str, str], tmux: FakeTmux, tmp_path: Path
) -> None:
    sizes: list[tuple[int, int]] = []
    tmux.resize = lambda pane, cols, rows: sizes.append((cols, rows))  # type: ignore[method-assign]
    sid = client.post("/v1/sessions", json={"runtime": "claude", "cwd": str(tmp_path)}, headers=auth).json()["id"]
    assert client.post(f"/v1/sessions/{sid}/resize", json={"cols": 46, "rows": 6}, headers=auth).status_code == 204
    assert sizes == [(46, 40)]


def test_one_server_under_two_socket_names_is_adopted_once(make_app, tmux: FakeTmux) -> None:  # type: ignore[no-untyped-def]
    from dataclasses import replace

    app = make_app(adopt_sockets=["default", "legacy"])
    client = TestClient(app)
    _, token = app.state.tokens.create("p2")
    auth = {"Authorization": f"Bearer {token}"}
    a = tmux.add_pane("default", "work", "claude")
    b = tmux.add_pane("legacy", "work", "claude")
    a.info = replace(a.info, pane_id="%7", server="same-server")
    b.info = replace(b.info, pane_id="%7", server="same-server")
    app.state.monitor.tick()
    assert len(client.get("/v1/sessions", headers=auth).json()) == 1
