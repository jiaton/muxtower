import dataclasses
import json
import os
from pathlib import Path

from fastapi.testclient import TestClient

from muxtower.app import create_app
from muxtower.config import load_settings
from muxtower.sessions.claude_processes import ClaudeProcesses
from muxtower.sessions.monitor import Monitor
from muxtower.sources.remote_control.service import RemoteControlSource
from tests.fakes import FakeTmux
from tests.rc_fakes import FakeRemoteControl, assistant, session


def test_finds_the_remote_session_of_a_panes_claude_process(tmp_path: Path) -> None:
    sessions = tmp_path / "sessions"
    sessions.mkdir()
    pid = os.getpid()
    processes = ClaudeProcesses(tmp_path)
    assert processes.remote_id(pid) is None  # no Claude Code here
    (sessions / f"{pid}.json").write_text(json.dumps({"pid": pid, "bridgeSessionId": "session_01ABC"}))
    assert processes.remote_id(pid) == "cse_01ABC"
    (sessions / f"{pid}.json").write_text(json.dumps({"pid": pid, "bridgeSessionId": None}))
    assert processes.remote_id(pid) is None


class FakeProcesses:
    def __init__(self, links: dict[int, str]) -> None:
        self.links = links

    def remote_id(self, pane_pid: int) -> str | None:
        return self.links.get(pane_pid)


def test_a_tmux_agent_with_remote_control_is_listed_once(tmp_path: Path) -> None:
    tmux = FakeTmux()
    pane = tmux.add_pane("default", "work", "claude")
    pane.info = dataclasses.replace(pane.info, pid=4242)
    port = FakeRemoteControl()
    port.sessions = [session("cse_1", title="Fix the login bug"), session("cse_2")]
    port.events = {"cse_1": [assistant(1, {"type": "text", "text": "Fixed."})]}
    source = RemoteControlSource(port, {})
    source.tick()
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False},
    )  # fmt: skip
    app = create_app(settings, tmux=tmux, run_loops=False, remote_control=source)
    Monitor(app.state.sessions, FakeProcesses({4242: "cse_1"})).tick()
    client = TestClient(app)
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}

    listed = client.get("/v1/sessions", headers=auth).json()
    assert sorted(s["id"] for s in listed) == sorted([listed[0]["id"], "cse_2"]) and len(listed) == 2
    merged = next(s for s in listed if s["remote_id"] == "cse_1")
    assert merged["name"] == "Fix the login bug" and merged["source"] == "adopted"
    assert merged["capabilities"]["screen"] and merged["capabilities"]["conversation"]
    assert client.get("/v1/sessions/cse_1", headers=auth).json()["id"] == merged["id"]
    conv = client.get(f"/v1/sessions/{merged['id']}/conversation", headers=auth).json()
    assert conv["session_id"] == merged["id"] and [i["text"] for i in conv["items"]] == ["Fixed."]
