"""Continue in terminal over a real link: the hub closes a Remote Control session of the Claude app on a node
(a fake Remote Control), the node finds its conversation in its own Claude Code files (made up here: a process
file naming the bridge, its transcript) and resumes it in a pane of its own (a fake tmux), and the hub lists
it once, as that node's pane session, with what the owner gave it. A real process stands for the Claude app's
Claude Code: it holds the conversation until the archive, then ends."""

import json
import subprocess
import threading
from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest
import uvicorn
from fastapi import FastAPI

from muxtower.app import create_app
from muxtower.sessions.claude_processes import ClaudeProcesses
from muxtower.sources.remote_control.service import RemoteControlSource
from tests.fakes import FakeTmux
from tests.integration.test_node_link import Running, _free_port, _settings, _until
from tests.rc_fakes import FakeRemoteControl, session

AGENT = "7a7a7a7a-0000-4000-8000-000000000001"


@pytest.fixture
def app_process() -> Iterator[subprocess.Popen[bytes]]:
    # The Claude app's Claude Code, as far as its files go.
    process = subprocess.Popen(["sleep", "60"])  # noqa: S603, S607
    yield process
    process.kill()
    process.wait()


def _claude_files(claude: Path, folder: Path, pid: int) -> None:
    """What Claude Code leaves on the node for the desktop app's session: its process file and transcript."""
    (claude / "sessions").mkdir(parents=True)
    (claude / "sessions" / f"{pid}.json").write_text(json.dumps({
        "pid": pid, "sessionId": AGENT, "cwd": str(folder), "bridgeSessionId": "session_DESK",
        "entrypoint": "claude-desktop", "kind": "interactive",
    }))  # fmt: skip
    projects = claude / "projects" / str(folder).replace("/", "-").replace("_", "-")
    projects.mkdir(parents=True)
    (projects / f"{AGENT}.jsonl").write_text(json.dumps({"type": "user", "uuid": "u1", "sessionId": AGENT}) + "\n")


@pytest.fixture
def hub(tmp_path: Path, app_process: subprocess.Popen[bytes]) -> Iterator[tuple[FastAPI, str, FakeRemoteControl]]:
    port = FakeRemoteControl()
    port.sessions = [
        session("cse_DESK", title="Plan the launch", environment_id="env_mac", tags=["remote-control-sdk"])
    ]
    archive = port.archive_session

    def archived(session_id: str) -> None:  # the desktop app lets go of it once archived
        archive(session_id)
        app_process.kill()
        app_process.wait()

    port.archive_session = archived  # type: ignore[method-assign]
    source = RemoteControlSource(port, {"env_mac": "mac"})
    source.tick()
    number = _free_port()
    app = create_app(_settings(tmp_path, "nas", number), tmux=FakeTmux(), run_loops=False, remote_control=source)
    app.state.continuer.sleep = lambda seconds: None
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=number, log_level="warning", lifespan="off"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    _until(lambda: server.started)
    yield app, f"http://127.0.0.1:{number}", port
    server.should_exit = True
    thread.join(5)


def test_the_node_resumes_the_claude_app_s_session_and_the_hub_lists_it_once(
    hub: tuple[FastAPI, str, FakeRemoteControl], tmp_path: Path, app_process: subprocess.Popen[bytes]
) -> None:
    hub_app, hub_url, port = hub
    _, token = hub_app.state.tokens.create("phone")
    phone = httpx.Client(base_url=hub_url, headers={"Authorization": f"Bearer {token}"}, timeout=30)
    hub_app.state.teams.set_role("cse_DESK", "researcher", None)
    hub_app.state.teams.set_project("cse_DESK", "acme/shop")

    folder = tmp_path / "work" / "shop"
    folder.mkdir(parents=True)
    claude = tmp_path / "mac-claude"
    _claude_files(claude, folder, app_process.pid)
    node_tmux = FakeTmux()
    node = create_app(_settings(tmp_path, "mac", _free_port()), tmux=node_tmux, run_loops=False)
    node.state.hub.api.processes = ClaudeProcesses(claude)  # its files, not the machine's own
    link = Running(node.state.hub.run_loop())
    try:
        code = hub_app.state.pairing.create_code("phone").code
        assert node.state.hub.join(hub_url, code).name == "mac"
        _until(lambda: hub_app.state.node_sessions.online("mac"))

        # The node is asked where the conversation is: there, its transcript too, still open in the app.
        assert phone.get("/v1/sessions/cse_DESK/continue").json()["step"] == "ready"

        done = phone.post("/v1/sessions/cse_DESK/continue").json()
        assert done["step"] == "done" and done["machine"] == "mac", done
        assert done["session_id"].startswith("mac~")
        assert ("archive", "cse_DESK") in port.calls

        [pane] = node_tmux.panes.values()  # started on the node, in its folder, the conversation resumed
        assert pane.argv[-2:] == ["--resume", AGENT] and pane.info.cwd == str(folder)
        assert "Plan the launch" in pane.argv

        listed = _until(lambda: [s for s in phone.get("/v1/sessions").json() if not s.get("archived_at")])
        assert [s["id"] for s in listed] == [done["session_id"]]  # one session, the node's pane
        [it] = listed
        assert (it["name"], it["team_role"], it["project"], it["node"]) == (
            "Plan the launch",
            "researcher",
            "acme/shop",
            "mac",
        )
        assert phone.get("/v1/sessions/cse_DESK").json()["id"] == done["session_id"]
        # Asked again: nothing more is done.
        assert phone.post("/v1/sessions/cse_DESK/continue").json() == done
        assert len(node_tmux.panes) == 1 and [c for c in port.calls if c[0] == "archive"] == [("archive", "cse_DESK")]
    finally:
        link.stop()
