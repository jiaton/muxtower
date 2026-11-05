"""A daemon that restarts refuses the hook's connection for a moment: the relay tries again, and when it
still cannot post it lets the event go, says nothing to the agent (exits 0, prints nothing) and logs a line."""

import io
import json
import socket
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

from muxtower.hooks import relay


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _target(tmp_path: Path, port: int) -> Path:
    return relay.write_target(tmp_path / "t.json", f"http://127.0.0.1:{port}/v1/hooks/claude-code", "s1", "secret")


def test_a_daemon_down_is_tried_again_then_let_go_quietly(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(relay, "RETRIES", (0.01, 0.01, 0.01))
    monkeypatch.setattr(sys, "stdin", io.TextIOWrapper(io.BytesIO(b'{"hook_event_name": "PostToolUse"}')))
    tries: list[int] = []
    real = socket.create_connection

    def counted(*args: object, **kwargs: object) -> socket.socket:
        tries.append(1)
        return real(*args, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(socket, "create_connection", counted)
    target = _target(tmp_path, _free_port())  # nothing listens: refused
    relay.main(["relay.py", str(target)])
    assert len(tries) == 4  # once, then again three times
    assert capsys.readouterr() == ("", "")  # nothing the agent would be shown
    assert "s1: not posted: ConnectionRefusedError" in (tmp_path / "relay.log").read_text()


def test_a_daemon_back_within_the_retries_gets_the_event(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    got: list[bytes] = []

    class Hooks(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            got.append(self.rfile.read(int(self.headers["Content-Length"])))
            self.send_response(200)
            self.end_headers()

        def log_message(self, *_: object) -> None:
            pass

    port = _free_port()

    def restarted() -> None:
        time.sleep(0.15)  # the daemon comes back after the first refusal
        server = HTTPServer(("127.0.0.1", port), Hooks)
        server.handle_request()
        server.server_close()

    threading.Thread(target=restarted, daemon=True).start()
    event = b'{"hook_event_name": "Stop"}'
    monkeypatch.setattr(sys, "stdin", io.TextIOWrapper(io.BytesIO(event)))
    relay.main(["relay.py", str(_target(tmp_path, port))])
    assert got == [event] and not (tmp_path / "relay.log").exists()
    assert json.loads((tmp_path / "t.json").read_text())["log"] == str(tmp_path / "relay.log")
