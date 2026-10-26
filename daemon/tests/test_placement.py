from pathlib import Path

from fastapi.testclient import TestClient

from muxtower.sessions.monitor import Monitor
from muxtower.sources.remote_control.ports import RawEvent
from muxtower.sources.remote_control.service import RemoteControlSource
from tests.fakes import FakeTmux
from tests.rc_fakes import FakeRemoteControl, assistant, session
from tests.test_archive import _app


def tool_call(seq: int, cwd: str) -> RawEvent:
    payload = {"type": "assistant", "wire_ingest_context": {f"toolu_{seq}": {"cwd": cwd}}}
    return RawEvent(seq=seq, created_at=None, source="worker", payload=payload)


def test_the_owner_places_a_session_its_source_cannot_place(tmp_path: Path) -> None:
    port = FakeRemoteControl()
    port.sessions = [session("cse_desk", environment_id="")]  # the desktop app names no machine
    early = [tool_call(1, "/Users/me/jobs"), tool_call(2, "/Users/me/jobs")]
    chatter = [assistant(seq, {"type": "text", "text": "…"}) for seq in range(3, 400)]
    port.events = {"cse_desk": early + chatter}
    source = RemoteControlSource(port, {})
    source.tick()  # reads the latest events only: no folder in them
    tmux = FakeTmux()
    tmux.add_pane("default", "work", "claude")
    app = _app(tmp_path, tmux, source)
    Monitor(app.state.sessions).reconcile()
    client = TestClient(app)
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}
    desk = client.get("/v1/sessions/cse_desk", headers=auth).json()
    assert (desk["machine"], desk["cwd"], desk["capabilities"]["place"]) == (None, "", True)

    placed = client.put("/v1/sessions/cse_desk/placement", headers=auth, json={"machine": "Laptop"}).json()
    assert placed["machine"] == "Laptop" and placed["placement"] == {"machine": "Laptop", "folder": None}

    found = client.post("/v1/sessions/cse_desk/placement/detect", headers=auth).json()
    assert found == {"folder": "/Users/me/jobs"}  # from the start of its log
    desk = client.get("/v1/sessions/cse_desk", headers=auth).json()
    assert (desk["machine"], desk["cwd"]) == ("Laptop", "/Users/me/jobs")  # the machine placed by hand stays

    cleared = client.put("/v1/sessions/cse_desk/placement", headers=auth, json={}).json()
    assert (cleared["machine"], cleared["cwd"], cleared["placement"]) == (None, "", None)

    local = next(s for s in client.get("/v1/sessions", headers=auth).json() if s["source"] == "adopted")
    assert not local["capabilities"]["place"]  # a tmux session here is where it is
    refused = client.put(f"/v1/sessions/{local['id']}/placement", headers=auth, json={"machine": "x"})
    assert refused.status_code == 409
