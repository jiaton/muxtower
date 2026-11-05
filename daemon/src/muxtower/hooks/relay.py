"""Posts one hook event to the daemon, for the harnesses' command hooks, which hand it the event on stdin
(Claude Code, Codex). Usage: relay.py <target>, a JSON file with the url to post to, the session, its token
and a log file.

It runs for every event, so it starts in milliseconds: the standard library only, run by path with
`python -I -S`. It waits for the daemon's answer, so events arrive in the order they happen, and never
fails the agent: whatever goes wrong, it prints nothing and exits 0. A daemon restarting refuses the
connection for a moment: tried again for about two seconds, then the event is let go (the screen rules see what it would
have said) and a line goes to the log. An agent shown "hook error: ECONNREFUSED" took muxtower for gone."""

import json
import os
import socket
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

TIMEOUT_SECONDS = 2  # within the 3 s Codex gives the hook
RETRIES = (0.3, 0.7, 1.0)  # seconds before each try again, while the daemon refuses the connection
RELAY = Path(__file__)


def relay_command(target: Path) -> str:
    """Runs the relay with this daemon's Python, isolated and without site-packages: standard library only."""
    import shlex
    import subprocess

    argv = [sys.executable, "-I", "-S", str(RELAY), str(target)]
    return subprocess.list2cmdline(argv) if os.name == "nt" else shlex.join(argv)


def write_target(path: Path, url: str, session: str, token: str) -> Path:
    """The relay's file for one session (0600: it holds the session's token)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.touch(mode=0o600)
    path.chmod(0o600)
    log = str(path.parent / "relay.log")
    path.write_text(json.dumps({"url": url, "session": session, "token": token, "log": log}))
    return path


def request(target: dict[str, str], body: bytes) -> bytes:
    url = urlsplit(target["url"])
    head = (
        f"POST {url.path or '/'} HTTP/1.1\r\nHost: {url.netloc}\r\n"
        f"Authorization: Bearer {target['token']}\r\nX-Muxtower-Session: {target['session']}\r\n"
        f"Content-Type: application/json\r\nContent-Length: {len(body)}\r\nConnection: close\r\n\r\n"
    )
    return head.encode() + body


def post(target: dict[str, str], body: bytes) -> None:
    url = urlsplit(target["url"])
    for wait in (*RETRIES, None):
        try:
            with socket.create_connection((url.hostname or "127.0.0.1", url.port or 80), TIMEOUT_SECONDS) as conn:
                conn.sendall(request(target, body))
                conn.recv(64)  # the status line: the daemon has taken it
            return
        except ConnectionRefusedError:
            if wait is None:
                raise
            time.sleep(wait)


def main(argv: list[str]) -> None:
    target: dict[str, str] = {}
    try:
        with open(argv[1], encoding="utf-8") as f:
            target = json.load(f)
        post(target, sys.stdin.buffer.read())
    except Exception as exc:  # noqa: BLE001 - a hook must never stop the agent
        try:
            if log := target.get("log"):
                with open(log, "a", encoding="utf-8") as f:
                    f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {target.get('session')}: not posted: {exc!r}\n")
        except OSError:
            pass


if __name__ == "__main__":
    main(sys.argv)
