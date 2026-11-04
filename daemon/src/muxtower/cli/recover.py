"""Sessions a restart interrupted, from a terminal, without a command of their own: `muxtower` lists them
and offers to start them again (all, those picked, or not now), and `muxtower attach` on one starts it
again first. For a daemon nobody reaches from the app, or before one does."""

import sys
from typing import Any

from muxtower.cli.client import LocalDaemon


def _pick(sessions: list[dict[str, Any]], answer: str) -> list[dict[str, Any]] | None:
    """Which to start again from what was typed: a = all; numbers = those; nothing = none. None: not understood."""
    answer = answer.strip().lower()
    if not answer or answer in ("n", "no", "none"):
        return []
    if answer in ("a", "all"):
        return sessions
    words = answer.replace(",", " ").split()
    picked = [int(a) for a in words if a.isdigit()]
    if len(picked) != len(words) or any(not 1 <= n <= len(sessions) for n in picked):
        return None
    return [sessions[n - 1] for n in dict.fromkeys(picked)]


def offer(daemon: LocalDaemon, sessions: list[dict[str, Any]]) -> None:
    """Below the status: the interrupted ones, numbered, and (in a terminal) whether to start them again."""
    waiting = [s for s in sessions if s.get("interrupted_at")]
    if not waiting:
        return
    print(f"\n{len(waiting)} session{'s' if len(waiting) != 1 else ''} interrupted by a restart:")
    for i, s in enumerate(waiting, 1):
        where = f"@{s['machine']} " if s.get("machine") else ""
        print(f"  {i}. {s['name']:<28} {s['runtime']:<12} {where}{s['cwd']}")
    if not sys.stdin.isatty():
        print("start them again in the app, or run `muxtower` in a terminal")
        return
    chosen = _pick(waiting, input("start again: all [a], some (e.g. 1 3), not now [Enter]: "))
    if chosen is None:
        print("not understood; nothing started", file=sys.stderr)
    elif chosen:
        for s in start_again(daemon, chosen):
            print(f"started {s['name']} again")


def start_again(daemon: LocalDaemon, sessions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    started: list[dict[str, Any]] = daemon.request("POST", "/v1/recovery", {"session_ids": [s["id"] for s in sessions]})
    return started
