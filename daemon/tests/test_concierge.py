import json
import os
import stat
import time
from collections.abc import Callable
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.concierge.service import ConciergeService
from muxtower.runtimes.models import AgentState
from muxtower.sessions.live import HookState
from muxtower.sessions.models import CreateSession
from tests.fakes import FakeTmux


def _concierge(make_app: Callable[..., FastAPI], tmp_path: Path) -> tuple[FastAPI, ConciergeService]:
    app = make_app(**{"concierge.enabled": True, "concierge.cwd": tmp_path / "home", "concierge.remote_control": True})
    concierge: ConciergeService = app.state.concierge
    return app, concierge


def test_starts_once_with_its_own_token_and_tools(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app, concierge = _concierge(make_app, tmp_path)
    assert concierge.ensure() is True
    assert concierge.ensure() is False
    pane = next(p for p in tmux.panes.values() if p.info.session_name.startswith("mxt-"))
    argv = pane.argv
    assert argv[argv.index("--model") + 1] == "sonnet"
    assert argv[argv.index("--remote-control") + 1] == "Assistant"
    assert "mcp__muxtower" in argv
    mcp_file = argv[argv.index("--mcp-config") + 1]
    assert stat.S_IMODE(os.stat(mcp_file).st_mode) == 0o600
    server = json.load(open(mcp_file))["mcpServers"]["muxtower"]
    token = server["headers"]["Authorization"].removeprefix("Bearer ")
    assert app.state.tokens.verify(token).name == "concierge"
    assert server["url"].endswith("/v1/mcp")

    client = TestClient(app)
    listed = client.get("/v1/sessions", headers={"Authorization": f"Bearer {token}"}).json()
    assert [s["role"] for s in listed] == ["concierge"]


def test_tells_the_concierge_about_watched_sessions(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app, concierge = _concierge(make_app, tmp_path)
    concierge.ensure()
    worker = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="notes"))
    live = app.state.sessions.live_of(worker.id)
    concierge.watch(worker.id)
    assert concierge.updates() == []

    live.last_message = "All tests pass."
    lines = concierge.updates()
    assert lines == [f"[muxtower] notes ({worker.id}) finished a turn: All tests pass."]

    # While the concierge itself shows a prompt, updates wait (typing could answer the prompt).
    concierge_live = app.state.sessions.live_of(concierge.session_id)
    concierge_live.hook = HookState(AgentState.NEEDS_PERMISSION, at=time.monotonic())
    concierge_live.effective = None
    concierge_pane = next(p for p in tmux.panes.values() if "--mcp-config" in p.argv)
    concierge.deliver(lines)
    assert concierge_pane.sent == []
    concierge_live.hook = None
    concierge_live.effective = None
    concierge.deliver([])
    assert ("text", lines[0]) in concierge_pane.sent
    assert app.state.mcp.tools["watch_session"]
