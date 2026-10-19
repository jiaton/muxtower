from pathlib import Path

from fastapi.testclient import TestClient

from muxtower.app import create_app
from muxtower.config import load_settings
from muxtower.sources.remote_control.service import RemoteControlSource
from tests.fakes import FakeTmux
from tests.rc_fakes import FakeRemoteControl, permission, session, user


def test_remote_sessions_through_the_api(tmp_path: Path) -> None:
    port = FakeRemoteControl()
    port.sessions = [session("cse_1", worker_status="requires_action")]
    port.events["cse_1"] = [user(1, "deploy it"), permission(2, "r1", "Bash", {"command": "make deploy"})]
    source = RemoteControlSource(port, {"env_box": "build-box"})
    source.tick()
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False, "adopt_sockets": []},
    )  # fmt: skip
    app = create_app(settings, tmux=FakeTmux(), run_loops=False, remote_control=source)
    client = TestClient(app)
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}

    (listed,) = client.get("/v1/sessions", headers=auth).json()
    assert listed["source"] == "remote_control" and listed["machine"] == "build-box" and listed["needs_attention"]
    conv = client.get("/v1/sessions/cse_1/conversation", headers=auth).json()
    assert [i["kind"] for i in conv["items"]] == ["prompt", "approval"]
    assert client.get("/v1/sessions/cse_1/screen", headers=auth).status_code == 409
    assert client.post("/v1/sessions/cse_1/approve", json={}, headers=auth).json()["option"] == "allow"
    assert client.post("/v1/sessions/cse_1/input", json={"text": "thanks"}, headers=auth).status_code == 204
    assert port.calls[-1] == ("message", "cse_1", "thanks")
    assert client.delete("/v1/sessions/cse_1", headers=auth).status_code == 409
    assert client.patch("/v1/sessions/cse_1", json={"name": "x"}, headers=auth).status_code == 409
    assert client.post("/v1/sessions/cse_1/input", json={"key": "Up"}, headers=auth).status_code == 409
    assert client.post("/v1/sessions/cse_1/resize", json={"cols": 80, "rows": 40}, headers=auth).status_code == 409
    assert client.post("/v1/sessions/cse_1/resize/release", headers=auth).status_code == 204
