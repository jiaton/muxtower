"""`muxtower trigger NAME`: fires one of the owner's triggers from their own script (a watcher, a cron job),
through the daemon on this machine (a node passes it to its hub, which keeps the triggers).

muxtower trigger NAME [--data FILE|-] [--key KEY]   fire it; prints "NAME: OUTCOME → TARGET"
muxtower trigger --list                             every trigger: name, enabled, action, last outcome

Exit status: 0 when the daemon took it (delivered, started, notified, filtered, deduped, paused,
rate_limited), 1 when its action failed, 2 for an unknown trigger or a daemon that refused or is not there."""

import argparse
import json
import sys
from typing import Any

from muxtower.cli.client import DaemonError, LocalDaemon
from muxtower.triggers.models import MAX_BODY

FAILED, REFUSED = 1, 2


def read_payload(data: str | None) -> tuple[Any, int]:
    """The payload `--data` names (a file, or `-` for stdin): JSON when it parses, else the text as it is;
    None without `--data`. With its size in bytes."""
    if data is None:
        return None, 0
    if data == "-":
        raw = sys.stdin.buffer.read()
    else:
        with open(data, "rb") as f:
            raw = f.read()
    try:
        return json.loads(raw), len(raw)
    except ValueError:
        return raw.decode(errors="replace"), len(raw)


def _target(target: str | None) -> str:
    if not target:
        return ""
    return f" → {target}"


def _action(action: dict[str, Any]) -> str:
    kind = str(action.get("kind"))
    if kind == "deliver":
        return f"deliver to {action.get('to')}"
    if kind == "start":
        where = action.get("role") or action.get("project") or action.get("machine")
        return f"start a session{f' ({where})' if where else ''}"
    return kind


def _list(daemon: LocalDaemon) -> int:
    triggers = daemon.request("GET", "/v1/triggers")
    if not triggers:
        print("no triggers; add one in the app")
        return 0
    for t in triggers:
        state = "enabled" if t["enabled"] else "paused"
        print(f"{t['name']:<24} {state:<8} {_action(t['action']):<32} {t.get('last_outcome') or '-'}")
    return 0


def cmd_trigger(args: argparse.Namespace, daemon: LocalDaemon) -> int:
    try:
        if args.list:
            return _list(daemon)
        if not args.name:
            print("muxtower trigger: name a trigger, or --list", file=sys.stderr)
            return REFUSED
        try:
            payload, size = read_payload(args.data)
        except OSError as exc:
            print(f"muxtower trigger: cannot read {args.data}: {exc.strerror or exc}", file=sys.stderr)
            return REFUSED
        if max(size, len(json.dumps(payload).encode())) > MAX_BODY:
            print(f"muxtower trigger: an event carries at most {MAX_BODY // 1024} KB; not sent", file=sys.stderr)
            return REFUSED
        body = {"name": args.name, "payload": payload, "key": args.key}
        firing = daemon.request("POST", "/v1/triggers/fire-by-name", body)
    except DaemonError as exc:
        print(f"muxtower trigger: {exc}", file=sys.stderr)
        return REFUSED
    line = f"{args.name}: {firing['outcome']}{_target(firing.get('target'))}"
    if firing["outcome"] == "failed":
        print(line + (f" ({firing['detail']})" if firing.get("detail") else ""), file=sys.stderr)
        return FAILED
    print(line)
    return 0


def add_trigger_parser(sub: Any) -> None:
    trigger = sub.add_parser("trigger", help="fire one of your triggers from a script (--list: all of them)")
    trigger.add_argument("name", nargs="?", help="the trigger's name")
    trigger.add_argument("--data", metavar="FILE", help="the event: a JSON (or text) file, or - for stdin")
    trigger.add_argument("--key", help="its dedupe key")
    trigger.add_argument("--list", action="store_true", help="list the triggers and their last outcome")
    trigger.set_defaults(func=cmd_trigger)
