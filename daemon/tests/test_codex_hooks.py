"""Codex's hooks: what muxtower adds to its command line, the relay, and what the daemon makes of them."""

import io
import json
import stat
import sys
import threading
import tomllib
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.hooks import relay
from muxtower.hooks.codex import EVENTS, SESSION_FLAGS, CodexHooks, handler, trusted_hash
from muxtower.hooks.ports import HookLaunch
from tests.fakes import FakeTmux

# What Codex 0.164 itself reported (app-server `hooks/list`, `currentHash`) for these two hooks.
CODEX_HASHES = {
    "stop": "sha256:0b0434341f0cfd3092cc12f300bd2afd29284b95f5b1be1f2e01b5f21078e2b4",
    "pre_tool_use": "sha256:5db71ba6cb2813ba1dfad5d1677099a9ebe3b190567a12448fa36a63befd5248",
}


def test_the_trust_hash_is_the_one_codex_computes() -> None:
    for label, expected in CODEX_HASHES.items():
        assert trusted_hash(label, handler("/usr/bin/true relay")) == expected


def test_launch_adds_trusted_command_hooks_and_a_private_target(tmp_path: Path) -> None:
    launch = HookLaunch("s1", "secret", "http://127.0.0.1:8731/v1/hooks/codex", tmp_path / "hooks")
    flag, value = CodexHooks().launch_args(launch)
    assert flag == "-c"
    hooks = tomllib.loads(value)["hooks"]  # what Codex parses
    assert set(EVENTS) <= set(hooks)
    command = hooks["Stop"][0]["hooks"][0]["command"]
    assert "relay.py" in command and "secret" not in command  # the token stays in the file
    for event, label in EVENTS.items():
        hook = hooks[event][0]["hooks"][0]
        assert hooks["state"][f"{SESSION_FLAGS}:{label}:0:0"]["trusted_hash"] == trusted_hash(label, hook)
    target = tmp_path / "hooks" / "s1.codex.json"
    log = str(tmp_path / "hooks" / "relay.log")
    assert json.loads(target.read_text()) == {"url": launch.url, "session": "s1", "token": "secret", "log": log}
    assert stat.S_IMODE(target.stat().st_mode) == 0o600


def test_the_relay_posts_the_event_and_never_fails(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    got: list[tuple[str, dict[str, str], bytes]] = []

    class Hooks(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            body = self.rfile.read(int(self.headers["Content-Length"]))
            got.append((self.path, dict(self.headers), body))
            self.send_response(200)
            self.end_headers()

        def log_message(self, *_: object) -> None:
            pass

    server = HTTPServer(("127.0.0.1", 0), Hooks)
    threading.Thread(target=server.handle_request, daemon=True).start()
    target = tmp_path / "t.json"
    url = f"http://127.0.0.1:{server.server_port}/v1/hooks/codex"
    target.write_text(json.dumps({"url": url, "session": "s1", "token": "secret"}))
    event = b'{"hook_event_name": "Stop", "last_assistant_message": "done"}'
    monkeypatch.setattr(sys, "stdin", io.TextIOWrapper(io.BytesIO(event)))
    relay.main(["relay.py", str(target)])
    server.server_close()
    path, headers, body = got[0]
    assert path == "/v1/hooks/codex" and body == event
    assert headers["Authorization"] == "Bearer secret" and headers["X-Muxtower-Session"] == "s1"

    relay.main(["relay.py", str(tmp_path / "missing.json")])  # nothing to post to: still exits quietly


def test_a_launched_codex_reports_through_its_hooks(app: FastAPI, client: TestClient, auth: dict[str, str],
                                                    tmux: FakeTmux, tmp_path: Path) -> None:  # fmt: skip
    res = client.post("/v1/sessions", json={"runtime": "codex", "cwd": str(tmp_path)}, headers=auth)
    assert res.status_code == 201, res.text
    session_id = res.json()["id"]
    pane = next(iter(tmux.panes.values()))
    assert pane.argv[:2] == ["codex", "-c"] and pane.argv[2].startswith("hooks={")
    target = json.loads((app.state.sessions.hook_files / f"{session_id}.codex.json").read_text())
    headers = {"Authorization": f"Bearer {target['token']}", "X-Muxtower-Session": session_id}

    body = {"hook_event_name": "PermissionRequest", "tool_name": "Bash", "tool_input": {"command": "touch x"},
            "session_id": "thread-1", "turn_id": "t1", "cwd": str(tmp_path), "model": "m"}  # fmt: skip
    assert client.post("/v1/hooks/codex", json=body, headers=headers).status_code == 200
    session = client.get(f"/v1/sessions/{session_id}", headers=auth).json()
    assert session["state"] == "needs_permission" and session["state_source"] == "hook"
    assert session["pending"]["tool_name"] == "Bash" and session["pending"]["detail"] == "touch x"

    ask = {"hook_event_name": "PreToolUse", "tool_name": "request_user_input", "session_id": "thread-1",
           "tool_input": {"questions": [{"id": "focus", "question": "What should the README focus on?",
                                         "options": [{"label": "Overview"}, {"label": "Guide"}]}]}}  # fmt: skip
    assert client.post("/v1/hooks/codex", json=ask, headers=headers).status_code == 200
    session = client.get(f"/v1/sessions/{session_id}", headers=auth).json()
    assert session["state"] == "needs_answer"  # Plan mode's question, with its text (not only the dialog's options)
    assert session["pending"]["detail"] == "What should the README focus on?"
    answered = {"hook_event_name": "PostToolUse", "tool_name": "request_user_input", "session_id": "thread-1"}
    client.post("/v1/hooks/codex", json=answered, headers=headers)
    assert client.get(f"/v1/sessions/{session_id}", headers=auth).json()["state"] == "busy"

    assert client.post("/v1/hooks/nope", json=body, headers=headers).status_code == 404
    client.delete(f"/v1/sessions/{session_id}", headers=auth)
    assert not list(app.state.sessions.hook_files.glob(f"{session_id}.*"))  # its files go with it
