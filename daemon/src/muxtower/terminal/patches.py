"""Screens as patches: a client that asks for them (`encoding: "lines"`) gets a full screen, then each next one
as the lines it shares with the one before plus the new ones, a few hundred bytes where a full screen is
tens of kilobytes (measured on a busy Claude Code session: 38.6 KB a screen, 8.9 KB deflated, against 708
B and 111 B as patches). permessage-deflate (negotiated with a 4 KB window, server_max_window_bits=12)
saves little between screens; a bigger window might help full screens too, which is not tried yet.

A patch is worked out once per screen, here, for every connection (`ScreenFeed`), and is a list of ops on
the screen numbered `base` that give the one numbered `seq`: `[start, count]` copies that many lines of
the base from `start`, a string is a new line (a line: what `\\n` separates in `ansi`). Put together, it is
the full screen, byte for byte. A screen comes whole instead when a patch would not be smaller, when the
two differ too much in length, or when working it out took too long."""

import itertools
import threading
import time
from dataclasses import dataclass
from typing import Any

Op = list[int] | str

MAX_GROWTH = 2000  # lines more or fewer than the base: then a full screen
SLOW_SECONDS = 0.002  # longer than this to work a patch out: a full screen
MIDDLE_DIFF = 200  # lines: a changed middle up to this long is diffed line by line, else sent as it is
LOOKAHEAD = 3  # lines that must match where the base is found to have scrolled to


def _shift(a: list[str], b: list[str]) -> int:
    """How many lines scrolled off the top of `a` for `b` to start where it does (0: none found)."""
    if not b or not a or a[:LOOKAHEAD] == b[:LOOKAHEAD]:
        return 0
    head = b[: min(LOOKAHEAD, len(b))]
    start = 0
    while True:
        try:
            k = a.index(head[0], start + 1)
        except ValueError:
            return 0
        if a[k : k + len(head)] == head:
            return k
        start = k


def _middle(a: list[str], b: list[str], offset: int) -> list[Op]:
    """Ops for a changed middle: line by line (longest common runs) when short, else its new lines."""
    if not a or not b or len(a) > MIDDLE_DIFF or len(b) > MIDDLE_DIFF:
        return list(b)
    import difflib  # a short middle only: its quadratic worst case stays small

    ops: list[Op] = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        ops += [[offset + i1, i2 - i1]] if tag == "equal" else b[j1:j2]
    return ops


def diff(a: list[str], b: list[str]) -> list[Op] | None:
    """Ops that make `b` from `a`, or None when a full screen is the better thing to send."""
    started = time.perf_counter()
    if abs(len(a) - len(b)) > MAX_GROWTH:
        return None
    k = _shift(a, b)
    rest = a[k:]
    prefix = 0
    limit = min(len(rest), len(b))
    while prefix < limit and rest[prefix] == b[prefix]:
        prefix += 1
    suffix = 0
    while suffix < limit - prefix and rest[-1 - suffix] == b[-1 - suffix]:
        suffix += 1
    ops: list[Op] = [[k, prefix]] if prefix else []
    ops += _middle(rest[prefix : len(rest) - suffix], b[prefix : len(b) - suffix], k + prefix)
    if suffix:
        ops.append([k + len(rest) - suffix, suffix])
    if time.perf_counter() - started > SLOW_SECONDS:
        return None
    return _merged(ops)


def _merged(ops: list[Op]) -> list[Op]:
    """Adjacent copies joined into one."""
    out: list[Op] = []
    for op in ops:
        last = out[-1] if out else None
        if isinstance(op, list) and isinstance(last, list) and last[0] + last[1] == op[0]:
            last[1] += op[1]
        elif not (isinstance(op, list) and op[1] == 0):
            out.append(list(op) if isinstance(op, list) else op)
    return out


def apply(a: list[str], ops: list[Op]) -> list[str]:
    """The screen the ops make from `a` (a client's work; here for tests). ValueError on a bad op."""
    out: list[str] = []
    for op in ops:
        if isinstance(op, str):
            out.append(op)
            continue
        start, count = op
        if start < 0 or count < 0 or start + count > len(a):
            raise ValueError(f"lines {start}+{count} are not in a screen of {len(a)}")
        out += a[start : start + count]
    return out


@dataclass(frozen=True)
class ScreenUpdate:
    """A new screen of a session, numbered, with the patch from the one before when it pays."""

    ansi: str
    seq: int
    base: int | None = None  # the screen the patch applies to
    ops: list[Op] | None = None


class ScreenFeed:
    """Numbers each session's screens and works each patch out once, for every connection."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._last: dict[str, tuple[int, list[str]]] = {}
        self._seq = itertools.count(1)

    def update(self, session_id: str, ansi: str) -> ScreenUpdate:
        lines = ansi.split("\n")
        with self._lock:
            before = self._last.get(session_id)
            seq = next(self._seq)
            self._last[session_id] = (seq, lines)
        if before is None:
            return ScreenUpdate(ansi, seq)
        ops = diff(before[1], lines)
        if ops is None or _size(ops) >= len(ansi):
            return ScreenUpdate(ansi, seq)
        return ScreenUpdate(ansi, seq, before[0], ops)

    def publish(self, bus: Any, session_id: str, ansi: str) -> None:
        bus.publish(f"screen:{session_id}", self.update(session_id, ansi))


def _size(ops: list[Op]) -> int:
    return sum(len(op) + 3 if isinstance(op, str) else 12 for op in ops)
