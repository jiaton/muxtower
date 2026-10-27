"""Posts one hook event to the daemon, for harnesses whose hooks run a command and hand it the event on
stdin (Codex). Usage: relay.py <target>, a JSON file with the url to post to, the session and its token.

It runs for every event, so it starts in milliseconds: the standard library only, run by path with
`python -I -S`. It waits for the daemon's answer, so events arrive in the order they happen, and never
fails the agent: whatever goes wrong, it prints nothing and exits 0."""

import json
import socket
import sys
from urllib.parse import urlsplit

TIMEOUT_SECONDS = 2  # within the 3 s Codex gives the hook


def request(target: dict[str, str], body: bytes) -> bytes:
    url = urlsplit(target["url"])
    head = (
        f"POST {url.path or '/'} HTTP/1.1\r\nHost: {url.netloc}\r\n"
        f"Authorization: Bearer {target['token']}\r\nX-Muxtower-Session: {target['session']}\r\n"
        f"Content-Type: application/json\r\nContent-Length: {len(body)}\r\nConnection: close\r\n\r\n"
    )
    return head.encode() + body


def main(argv: list[str]) -> None:
    try:
        with open(argv[1], encoding="utf-8") as f:
            target = json.load(f)
        url = urlsplit(target["url"])
        body = sys.stdin.buffer.read()
        with socket.create_connection((url.hostname or "127.0.0.1", url.port or 80), TIMEOUT_SECONDS) as conn:
            conn.sendall(request(target, body))
            conn.recv(64)  # the status line: the daemon has taken it
    except Exception:  # noqa: BLE001, S110 - a hook must never stop the agent
        pass


if __name__ == "__main__":
    main(sys.argv)
