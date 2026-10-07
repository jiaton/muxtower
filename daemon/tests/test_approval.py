import hashlib
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.errors import Conflict
from muxtower.hooks.claude_code import HookEvent
from tests import screens
from tests.fakes import FakePane, FakeTmux


def _adopt(app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux) -> tuple[str, FakePane]:
    pane = tmux.add_pane("default", "work", "claude")
    app.state.monitor.tick()
    return client.get("/v1/sessions", headers=auth).json()[0]["id"], pane


def test_approve_prefers_session_wide_option(app: FastAPI, client: TestClient, auth: dict[str, str],
                                             tmux: FakeTmux) -> None:  # fmt: skip
    sid, pane = _adopt(app, client, auth, tmux)
    pane.screen = screens.PERMISSION
    res = client.post(f"/v1/sessions/{sid}/approve", json={}, headers=auth)
    assert res.status_code == 200 and res.json()["option"] == "2"
    assert pane.sent == [("key", "Down"), ("key", "Enter")]


def test_explicit_option_and_deny(app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux) -> None:
    sid, pane = _adopt(app, client, auth, tmux)
    pane.screen = screens.QUESTION
    assert client.post(f"/v1/sessions/{sid}/approve", json={"option": "9"}, headers=auth).status_code == 400
    assert client.post(f"/v1/sessions/{sid}/approve", json={}, headers=auth).status_code == 409  # a human decides
    assert client.post(f"/v1/sessions/{sid}/approve", json={"option": "2"}, headers=auth).json()["option"] == "2"
    assert pane.sent == [("key", "Down"), ("key", "Enter")]
    assert client.post(f"/v1/sessions/{sid}/deny", headers=auth).status_code == 200
    assert pane.sent[-1] == ("key", "Escape")


def test_refuses_when_nothing_is_on_screen(
    app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux
) -> None:
    sid, pane = _adopt(app, client, auth, tmux)
    pane.screen = screens.BUSY
    assert client.post(f"/v1/sessions/{sid}/approve", json={}, headers=auth).status_code == 409
    assert pane.sent == []


def test_hook_only_dialog_waits_until_settled(app: FastAPI, tmux: FakeTmux) -> None:
    pane = tmux.add_pane("default", "work", "claude")
    app.state.monitor.tick()
    record = app.state.sessions.repo.list()[0]
    record.hook_token_hash = hashlib.sha256(b"t").hexdigest()
    with app.state.sessions.repo.db.connect() as conn:
        conn.execute("UPDATE sessions SET hook_token_hash = ? WHERE id = ?", (record.hook_token_hash, record.id))
    app.state.sessions.apply_hook(record.id, "t", HookEvent(hook_event_name="PermissionRequest", tool_name="Bash"))
    pane.screen = "a custom theme no rule recognises\n ❯ Yes\n   No\n"

    approvals = app.state.approvals
    with pytest.raises(Conflict, match="not on screen"):
        approvals.approve(record.id, None)
    app.state.sessions.live[record.id].hook.at = time.monotonic() - 2
    assert approvals.approve(record.id, None).option == "1"  # settled, rules miss, menu readable -> allowed
    with pytest.raises(Conflict, match="not on screen"):
        approvals.approve(record.id, None, strict=True)  # auto-approve never acts on hooks alone
