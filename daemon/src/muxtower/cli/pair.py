"""`muxtower pair`: show a one-time pairing code.

The daemon cannot know which address a device will reach it at (container, LAN, tailnet, proxy,
tunnel). With --url or `public_url` it shows a QR code for that address; otherwise it shows just the
code and the addresses it can see, and the device enters the code on whichever address it opened."""

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


def cmd_pair(args: argparse.Namespace, daemon: LocalDaemon) -> int:
    daemon.ensure_running()
    if args.revoke:
        daemon.request("DELETE", f"/v1/devices/{quote(args.revoke)}")
        print(f"revoked {args.revoke!r}")
        return 0

    code = daemon.request("POST", "/v1/pair/codes")
    expires = code["expires_at"][11:19]
    url = (args.url or daemon.settings.public_url or "").rstrip("/")
    if url:
        app = (args.app or url).rstrip("/")
        link = f"{app}/pair#u={quote(url, safe='')}&c={code['code']}"
        segno.make(link, error="L").terminal(compact=True)
        print(f"\nScan with the device's camera, or open {link}")
        print(f"Or open {url} on the device and enter the code: {code['code']}")
        if not url.startswith("https://") and "127.0.0.1" not in url:
            print("\nwarning: without HTTPS the app cannot install or receive notifications.", file=sys.stderr)
    else:
        # Which address a device will use (LAN, tailnet, a proxy, a tunnel) is not knowable from here, so
        # nothing is baked into a QR code. The device opens whatever address works for it.
        print(f"Pairing code: {code['code']}\n")
        print("Open this daemon's address on the new device and enter the code. Addresses seen from here:")
        for candidate, note in candidates(daemon.settings.port):
            print(f"  {candidate}  ({note})")
        print("\nFor a QR code, pass --url, or set public_url in the config.")
    print(f"The code works once and expires at {expires} UTC.")
    return 0
