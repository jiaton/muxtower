"""Archiving means what it says: muxtower ends what it can (a tmux pane, also one on Remote Control; Codex;
a session in Anthropic's cloud). A session it sees only through Remote Control that runs in Claude's
desktop app goes on there whatever claude.ai says, so it is only hidden here, and never archived on
Remote Control (which left the two disagreeing, and muxtower saying "its agent has ended")."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.app import create_app
from muxtower.config import load_settings
from muxtower.mcp.session_tools import ArchiveArgs
from muxtower.sessions.endable import ends_when_archived
from muxtower.sessions.models import CreateSession
from muxtower.sources.remote_control.service import RemoteControlSource
from tests.fakes import FakeTmux
from tests.rc_fakes import FakeRemoteControl, session


def _app(tmp_path: Path, port: FakeRemoteControl) -> FastAPI:
    source = RemoteControlSource(port, {"env_box": "build-box"})
    source.tick()
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False, "adopt_sockets": []},
    )  # fmt: skip
    return create_app(settings, tmux=FakeTmux(), run_loops=False, remote_control=source)


def _port() -> FakeRemoteControl:
    port = FakeRemoteControl()
    port.sessions = [
        session("cse_desk", tags=["remote-control-sdk"]),  # the desktop app's
        session("cse_cloud", environment_id=None, environment_kind="anthropic_cloud"),
    ]
    return port


def test_which_sessions_muxtower_can_end(tmp_path: Path) -> None:
    app = _app(tmp_path, _port())
    by_id = {s.id: s for s in app.state.directory.list()}
    assert not ends_when_archived(by_id["cse_desk"]) and by_id["cse_desk"].capabilities.archive_ends is False
    assert ends_when_archived(by_id["cse_cloud"]) and by_id["cse_cloud"].capabilities.archive_ends
    launched = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path)))
    assert ends_when_archived(launched) and launched.capabilities.archive_ends  # in tmux, Remote Control or not


def test_archiving_a_desktop_session_hides_it_and_leaves_claude_ai_alone(tmp_path: Path) -> None:
    port = _port()
    app = _app(tmp_path, port)
    client = TestClient(app)
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}
    assert client.post("/v1/sessions/cse_desk/archive", headers=auth).status_code == 204  # an older app's archive
    assert ("archive", "cse_desk") not in port.calls
    desk = app.state.directory.get("cse_desk")
    assert desk.hidden and not desk.archived_at

    said = app.state.mcp.session_tools.archive_session(ArchiveArgs(session_id="cse_cloud"))
    assert ("archive", "cse_cloud") in port.calls and "its agent has ended" in said  # the cloud's: it ends


def test_the_mcp_tool_says_it_was_only_hidden_and_where_to_end_it(tmp_path: Path) -> None:
    port = _port()
    app = _app(tmp_path, port)
    said = app.state.mcp.session_tools.archive_session(ArchiveArgs(session_id="cse_desk"))
    assert said.startswith("Hidden cse_desk in muxtower, not archived: it runs in the Claude desktop app")
    assert "muxtower cannot end" in said and "do so in the Claude desktop app" in said
    assert "has ended" not in said and port.calls == []
