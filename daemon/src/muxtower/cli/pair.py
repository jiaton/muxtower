"""`muxtower pair`: show a one-time pairing code as a QR code and as text.

The daemon cannot know which address a phone will reach it at (container, LAN, tailnet, public
proxy), so the URL comes from --url, then `public_url` in config, then detected candidates, and the
user picks when there is more than one."""

import argparse
import json
import shutil
import socket
import subprocess
import sys
from urllib.parse import quote

import segno

from muxtower.cli.client import LocalDaemon


def _tailscale_url() -> str | None:
    if not shutil.which("tailscale"):
        return None
    try:
        out = subprocess.run(  # noqa: S603 - fixed argv
            ["tailscale", "status", "--json"],  # noqa: S607 - resolved via PATH on purpose
            capture_output=True,
            text=True,
            timeout=3,
            check=True,
        ).stdout
        name = json.loads(out).get("Self", {}).get("DNSName", "").rstrip(".")
    except (OSError, subprocess.SubprocessError, ValueError):
        return None
    return f"https://{name}" if name else None


def _lan_ip() -> str | None:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("192.0.2.1", 9))  # TEST-NET address: picks the outbound interface, sends nothing
            ip: str = s.getsockname()[0]
        except OSError:
            return None
    return None if ip.startswith("127.") else ip


def candidates(port: int) -> list[tuple[str, str]]:
    found = []
    if url := _tailscale_url():
        found.append((url, "Tailscale (needs `tailscale serve` in front of the daemon)"))
    if ip := _lan_ip():
        found.append((f"http://{ip}:{port}", "LAN (plain HTTP: no push notifications)"))
    found.append((f"http://127.0.0.1:{port}", "this machine only"))
    return found


def _choose(options: list[tuple[str, str]]) -> str:
    if len(options) == 1 or not sys.stdin.isatty():
        return options[0][0]
    print("Which address will the new device use to reach this daemon?")
    for i, (url, note) in enumerate(options, 1):
        print(f"  {i}. {url}  ({note})")
    print(f"  {len(options) + 1}. enter another URL")
    choice = input("> ").strip() or "1"
    if choice.isdigit() and 1 <= int(choice) <= len(options):
        return options[int(choice) - 1][0]
    return input("URL: ").strip()


def cmd_pair(args: argparse.Namespace, daemon: LocalDaemon) -> int:
    daemon.ensure_running()
    if args.revoke:
        daemon.request("DELETE", f"/v1/devices/{quote(args.revoke)}")
        print(f"revoked {args.revoke!r}")
        return 0

    url = args.url or daemon.settings.public_url
    if not url:
        url = _choose(candidates(daemon.settings.port))
        print(f'tip: set public_url = "{url}" in the config to skip this question\n')
    url = url.rstrip("/")
    app = (args.app or url).rstrip("/")
    code = daemon.request("POST", "/v1/pair/codes")
    link = f"{app}/pair#u={quote(url, safe='')}&c={code['code']}"

    segno.make(link, error="L").terminal(compact=True)
    print(f"\nScan with the phone's camera, or open {link}")
    print(f"Or open {url} on the device and enter the code: {code['code']}")
    print(f"The code works once and expires at {code['expires_at'][11:19]} UTC.")
    if not url.startswith("https://") and "127.0.0.1" not in url:
        print("\nwarning: without HTTPS the app cannot install or receive push notifications.", file=sys.stderr)
    return 0
