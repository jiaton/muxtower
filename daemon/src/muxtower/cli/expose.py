"""`muxtower expose tailscale`: HTTPS in front of the daemon in one step.

`tailscale serve` puts the daemon at https://<machine>.<tailnet>.ts.net, with a certificate Tailscale
keeps, for the devices signed in to the same tailnet only (the phone runs the Tailscale app). Tailscale
keeps serving it across restarts. The address goes into the config as `public_url`, so pairing shows a QR
code and iPhones accept the daemon's notifications. `--off` undoes both."""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tomllib
from pathlib import Path
from typing import Any

from muxtower.cli.client import LocalDaemon
from muxtower.config import config_path

# The Mac App Store app keeps its command line inside the app bundle, off PATH.
TAILSCALE_APPS = ("/Applications/Tailscale.app/Contents/MacOS/Tailscale",)
_PUBLIC_URL = re.compile(r"^\s*public_url\s*=")


def find_tailscale() -> str | None:
    return shutil.which("tailscale") or next((p for p in TAILSCALE_APPS if os.access(p, os.X_OK)), None)


def _json(tailscale: str, *args: str) -> Any:
    try:
        out = subprocess.run(  # noqa: S603 - fixed argv
            [tailscale, *args, "--json"], capture_output=True, text=True, timeout=5, check=True
        ).stdout
        return json.loads(out or "{}")
    except (OSError, subprocess.SubprocessError, ValueError):
        return None


def machine_name(tailscale: str) -> str | None:
    """This machine's name on the tailnet (box.tail1234.ts.net), when Tailscale is up here."""
    status = _json(tailscale, "status")
    if not isinstance(status, dict) or status.get("BackendState") not in (None, "Running"):
        return None
    return (status.get("Self") or {}).get("DNSName", "").rstrip(".") or None


def tailscale_url() -> str | None:
    tailscale = find_tailscale()
    name = machine_name(tailscale) if tailscale else None
    return f"https://{name}" if name else None


def served(tailscale: str, name: str, port: int) -> str | None:
    """What Tailscale serves at https://name:port/ already: a proxy's target, "" for anything else."""
    config = _json(tailscale, "serve", "status") or {}
    if str(port) in (config.get("TCP") or {}) and not config["TCP"][str(port)].get("HTTPS"):
        return ""  # forwarded as plain TCP
    root = ((config.get("Web") or {}).get(f"{name}:{port}") or {}).get("Handlers", {}).get("/")
    return None if root is None else str(root.get("Proxy") or "")


def with_public_url(text: str, url: str | None) -> str:
    """The config file's text with its top-level `public_url` set to `url` (None: removed)."""
    lines = text.splitlines()
    top = next((i for i, line in enumerate(lines) if line.lstrip().startswith("[")), len(lines))
    found = next((i for i in range(top) if _PUBLIC_URL.match(lines[i])), None)
    entry = [] if url is None else [f"public_url = {json.dumps(url)}"]
    if found is not None:
        lines[found : found + 1] = entry
    else:
        lines[0:0] = entry + ([""] if entry and lines else [])
    result = "\n".join(lines) + "\n" if lines else ""
    try:
        done = tomllib.loads(result).get("public_url") == url
    except tomllib.TOMLDecodeError:
        done = False
    if not done:  # a multi-line value, say: leave the file alone
        raise ValueError("cannot set public_url in the config file; set it by hand")
    return result


def _write_public_url(file: Path, url: str | None) -> bool:
    try:
        text = with_public_url(file.read_text() if file.exists() else "", url)
    except ValueError as exc:
        print(f"{file}: {exc}", file=sys.stderr)
        return False
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(text)
    return True


def cmd_expose(args: argparse.Namespace, daemon: LocalDaemon) -> int:
    tailscale = find_tailscale()
    if tailscale is None:
        print("Tailscale is not installed here: https://tailscale.com/download", file=sys.stderr)
        return 1
    name = machine_name(tailscale)
    if name is None:
        print("Tailscale is not signed in here: run `tailscale up` first", file=sys.stderr)
        return 1
    port = args.https_port
    url = f"https://{name}" + ("" if port == 443 else f":{port}")
    target = f"http://127.0.0.1:{daemon.settings.port}"
    file = config_path()
    now = served(tailscale, name, port)

    if args.off:
        if now == target:
            subprocess.run([tailscale, "serve", f"--https={port}", "off"], check=False)  # noqa: S603
        print(f"{url} no longer serves muxtower")
        return 0 if daemon.settings.public_url != url or _write_public_url(file, None) else 1

    if now not in (None, target):
        print(
            f"Tailscale already serves something else at {url} ({now or 'TCP'}); "
            "pick another port with --https-port, e.g. 8443",
            file=sys.stderr,
        )
        return 1
    if now is None:
        # Not captured: the first time, Tailscale may print a link to turn HTTPS on for the tailnet and wait.
        done = subprocess.run([tailscale, "serve", "--bg", f"--https={port}", target], check=False)  # noqa: S603
        if done.returncode != 0:
            print(
                "\n`tailscale serve` failed. On Linux it needs root, or this user as Tailscale's operator: "
                "`sudo tailscale set --operator=$USER`, then run this again.",
                file=sys.stderr,
            )
            return 1
    print(f"serving {url} → {target} (only devices on your tailnet reach it)")

    if daemon.settings.public_url != url:
        if not _write_public_url(file, url):
            return 1
        print(f"public_url = {url} written to {file}")
        if os.environ.get("MUXTOWER_PUBLIC_URL"):
            print("note: MUXTOWER_PUBLIC_URL is set and wins over the config file", file=sys.stderr)
        if daemon.running():
            print("The daemon is running: restart it so notifications to iPhones use this address.")
    print("Next: install Tailscale on your phone, sign in to the same tailnet, and run `muxtower pair`.")
    return 0


def add_expose_parser(sub: Any) -> None:
    expose = sub.add_parser("expose", help="HTTPS for the daemon on your tailnet (tailscale serve)")
    expose.add_argument("via", choices=["tailscale"], help="how to reach it; only tailscale for now")
    expose.add_argument("--https-port", type=int, default=443, help="the port on the tailnet (default 443)")
    expose.add_argument("--off", action="store_true", help="stop serving it and remove public_url")
    expose.set_defaults(func=cmd_expose)
