"""A restart, a recovery or a re-adopt never makes a session unread by itself: only the agent's own output
after the owner last looked does. Remote Control's `last_event_at` moves with events that are no output
(a muxtower restart reconnects its MCP server in every session), and its own unread flag stays set while
the owner reads in muxtower rather than the Claude apps."""

import dataclasses
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from muxtower.app import create_app
from muxtower.config import load_settings
from muxtower.sessions.monitor import Monitor
from muxtower.sources.remote_control.ports import RawEvent
from muxtower.sources.remote_control.service import RemoteControlSource
from tests.fakes import FakeTmux
from tests.rc_fakes import FakeRemoteControl, session
from tests.test_linking import FakeProcesses

PANE_PID = 4242


def _iso(at: datetime) -> str:
    return at.isoformat().replace("+00:00", "Z")


def _reply(seq: int, at: datetime, text: str) -> RawEvent:
    payload = {"type": "assistant", "message": {"role": "assistant", "content": [{"type": "text", "text": text}]}}
    return RawEvent(seq, _iso(at), "worker", payload)


def _reconnect(seq: int, at: datetime) -> RawEvent:
    """An event that is no output of the agent's: its MCP server connecting again."""
    return RawEvent(seq, _iso(at), "worker", {"type": "system", "subtype": "mcp_server_status", "status": "connected"})


def _start(tmp_path: Path, tmux: FakeTmux, port: FakeRemoteControl) -> tuple[TestClient, dict[str, str]]:
    """The daemon starting on the state in `tmp_path` (as a restart does)."""
    source = RemoteControlSource(port, {})
    source.tick()
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False},
    )  # fmt: skip
    app = create_app(settings, tmux=tmux, run_loops=False, remote_control=source)
    Monitor(app.state.sessions, FakeProcesses({PANE_PID: "cse_merged"})).tick()
    _, token = app.state.tokens.create(f"phone-{len(app.state.tokens.list())}")
    return TestClient(app), {"Authorization": f"Bearer {token}"}


def _unread(client: TestClient, auth: dict[str, str]) -> dict[str, Any]:
    return {s["remote_id"] or s["id"]: s["unread"] for s in client.get("/v1/sessions", headers=auth).json()}


def test_a_restart_keeps_what_was_read_read_and_only_new_output_makes_it_unread(tmp_path: Path) -> None:
    earlier = datetime.now(UTC) - timedelta(hours=1)
    tmux = FakeTmux()
    merged = tmux.add_pane("default", "merged", "claude")
    merged.info = dataclasses.replace(merged.info, pid=PANE_PID)
    tmux.add_pane("default", "plain", "claude")
    port = FakeRemoteControl()
    # The Claude apps' own unread flag stays set: the owner reads in muxtower.
    port.sessions = [
        session(sid, unread=True, last_event_at=_iso(earlier), created_at=_iso(earlier - timedelta(hours=1)))
        for sid in ("cse_merged", "cse_alone")
    ]
    port.events = {sid: [_reply(1, earlier, "Done.")] for sid in ("cse_merged", "cse_alone")}

    client, auth = _start(tmp_path, tmux, port)
    listed = _unread(client, auth)
    assert set(listed) == {"cse_merged", "cse_alone", next(k for k in listed if not k.startswith("cse_"))}
    for s in client.get("/v1/sessions", headers=auth).json():
        assert client.post(f"/v1/sessions/{s['id']}/read", json={}, headers=auth).status_code == 204
    assert not any(_unread(client, auth).values())

    # Restart: the state is read back from the database; every Remote Control session got an event that is
    # no output (its MCP server reconnected to the new daemon), so its last_event_at moved past the read.
    after = datetime.now(UTC) + timedelta(seconds=5)
    for s in port.sessions:
        s["last_event_at"] = _iso(after)
        port.events[s["id"]].append(_reconnect(2, after))
    client, auth = _start(tmp_path, tmux, port)
    assert not any(_unread(client, auth).values()), _unread(client, auth)

    # Real output after the read: unread, for the session that had it only.
    later = datetime.now(UTC) + timedelta(minutes=1)
    port.sessions[0]["last_event_at"] = _iso(later)
    port.events["cse_merged"].append(_reply(3, later, "New results."))
    client, auth = _start(tmp_path, tmux, port)
    listed = _unread(client, auth)
    assert listed["cse_merged"] is True
    assert listed["cse_alone"] is False and not any(v for k, v in listed.items() if not k.startswith("cse_"))
