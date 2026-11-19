"""`muxtower trigger`: the payload (a file, stdin, text, none), the 64 KB cap kept before sending, one line out,
and its exit status, against a fake daemon on a throwaway port."""

import io
import json
import threading
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import pytest

from muxtower.cli import main as cli_main
from muxtower.config import Settings, load_settings

FIRING = {"id": 7, "trigger_id": "t1", "at": "2026-01-01T00:00:00Z", "via": "cli", "bytes": 9}
LISTED = [
    {"name": "deal-watch", "enabled": True, "action": {"kind": "deliver", "to": "buyer@deals"}, "last_outcome": None},
    {"name": "nightly", "enabled": False, "action": {"kind": "notify"}, "last_outcome": "paused"},
]


class FakeDaemon:
    """Answers each request with what `replies` holds for it; keeps what it was sent."""

    def __init__(self) -> None:
        self.sent: list[tuple[str, str, Any, str]] = []
        self.replies: dict[tuple[str, str], tuple[int, Any]] = {}
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def _answer(self) -> None:
                raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
                body = json.loads(raw) if raw else None
                fake.sent.append((self.command, self.path, body, self.headers["Authorization"]))
                status, reply = fake.replies.get((self.command, self.path), (404, {"detail": "Not Found"}))
                data = json.dumps(reply).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            do_GET = do_POST = _answer

            def log_message(self, *_: Any) -> None:
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def fires(self, outcome: str, target: str | None = None, detail: str | None = None) -> None:
        firing = {**FIRING, "outcome": outcome, "target": target, "detail": detail}
        self.replies[("POST", "/v1/triggers/fire-by-name")] = (200, firing)


@pytest.fixture
def daemon(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeDaemon]:
    fake = FakeDaemon()
    settings: Settings = load_settings(
        config_file=tmp_path / "none.toml", env={}, overrides={"port": fake.port, "state_dir": tmp_path / "s"}
    )
    monkeypatch.setattr(cli_main, "load_settings", lambda: settings)
    yield fake
    fake.server.shutdown()


def run(*argv: str) -> int:
    with pytest.raises(SystemExit) as done:
        cli_main.main(["trigger", *argv])
    return int(done.value.code or 0)


def test_fires_by_name_and_says_what_became_of_it(daemon: FakeDaemon, capsys: pytest.CaptureFixture[str]) -> None:
    daemon.fires("delivered", target="buyer (3f2a)")
    assert run("deal-watch", "--key", "item-42") == 0
    assert capsys.readouterr().out == "deal-watch: delivered → buyer (3f2a)\n"
    method, path, body, auth = daemon.sent[-1]
    assert (method, path) == ("POST", "/v1/triggers/fire-by-name")
    assert body == {"name": "deal-watch", "payload": None, "key": "item-42"}  # no --data: null
    assert auth.startswith("Bearer ") and len(auth) > 20  # this machine's CLI token


@pytest.mark.parametrize("outcome", ["started", "notified", "filtered", "deduped", "paused", "rate_limited"])
def test_whatever_the_daemon_took_exits_0(daemon: FakeDaemon, outcome: str) -> None:
    daemon.fires(outcome)
    assert run("deal-watch") == 0


def test_a_failed_action_exits_1_and_says_why(daemon: FakeDaemon, capsys: pytest.CaptureFixture[str]) -> None:
    daemon.fires("failed", detail="no session buyer@deals")
    assert run("deal-watch") == 1
    assert capsys.readouterr().err == "deal-watch: failed (no session buyer@deals)\n"


def test_an_unknown_trigger_or_a_daemon_error_exits_2(daemon: FakeDaemon, capsys: pytest.CaptureFixture[str]) -> None:
    daemon.replies[("POST", "/v1/triggers/fire-by-name")] = (404, {"detail": "no trigger named 'nope'"})
    assert run("nope") == 2
    assert capsys.readouterr().err == "muxtower trigger: no trigger named 'nope'\n"
    daemon.replies[("POST", "/v1/triggers/fire-by-name")] = (502, {"detail": "the hub cannot be asked now"})
    assert run("deal-watch") == 2
    assert "the hub cannot be asked now" in capsys.readouterr().err
    daemon.server.shutdown()
    daemon.server.server_close()
    assert run("deal-watch") == 2
    assert "cannot reach the daemon" in capsys.readouterr().err


def test_data_is_json_when_it_parses_else_text(daemon: FakeDaemon, tmp_path: Path) -> None:
    daemon.fires("delivered")
    event = tmp_path / "event.json"
    event.write_text('{"deal": {"price": 19.5, "title": "Desk lamp"}}')
    assert run("deal-watch", "--data", str(event)) == 0
    assert daemon.sent[-1][2]["payload"] == {"deal": {"price": 19.5, "title": "Desk lamp"}}
    event.write_text("price dropped to 19.50")
    assert run("deal-watch", "--data", str(event)) == 0
    assert daemon.sent[-1][2]["payload"] == "price dropped to 19.50"
    assert run("deal-watch", "--data", str(tmp_path / "missing.json")) == 2


def test_data_from_stdin(daemon: FakeDaemon, monkeypatch: pytest.MonkeyPatch) -> None:
    daemon.fires("delivered")
    monkeypatch.setattr("sys.stdin", io.TextIOWrapper(io.BytesIO(b'[1, 2, "three"]')))
    assert run("deal-watch", "--data", "-") == 0
    assert daemon.sent[-1][2]["payload"] == [1, 2, "three"]


def test_more_than_64_kb_is_refused_before_sending(
    daemon: FakeDaemon, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    daemon.fires("delivered")
    big = tmp_path / "big.txt"
    big.write_text("x" * (64 * 1024 + 1))
    assert run("deal-watch", "--data", str(big)) == 2
    assert "at most 64 KB" in capsys.readouterr().err
    assert daemon.sent == []
    big.write_text("x" * (60 * 1024))
    assert run("deal-watch", "--data", str(big)) == 0


def test_list_says_each_trigger_and_its_last_outcome(daemon: FakeDaemon, capsys: pytest.CaptureFixture[str]) -> None:
    daemon.replies[("GET", "/v1/triggers")] = (200, LISTED)
    assert run("--list") == 0
    lines = capsys.readouterr().out.splitlines()
    assert lines[0].split() == ["deal-watch", "enabled", "deliver", "to", "buyer@deals", "-"]
    assert lines[1].split() == ["nightly", "paused", "notify", "paused"]
    assert run() == 2  # neither a name nor --list
