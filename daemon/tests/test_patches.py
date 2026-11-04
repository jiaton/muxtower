"""Screens as patches: put together they are each screen byte for byte; a connection gets a patch only on
the screen it has (else the whole one, numbered), and only when it asked for patches."""

import random
import time

from muxtower.terminal.patches import ScreenFeed, apply, diff
from muxtower.terminal.stream import ScreenFrame, ScreenPatchFrame, _Connection


def _next(rng: random.Random, lines: list[str]) -> list[str]:
    kind = rng.choice(["scroll", "middle", "append", "truncate", "redraw", "same", "spinner"])
    out = list(lines)
    if kind == "scroll":
        n = rng.randint(1, 5)
        out = out[n:] + [f"new {rng.random()}" for _ in range(n)]
    elif kind == "middle" and out:
        at = rng.randrange(len(out))
        out[at : at + rng.randint(0, 3)] = [f"edit {rng.random()}" for _ in range(rng.randint(0, 4))]
    elif kind == "append":
        out += [f"tail {rng.random()}" for _ in range(rng.randint(1, 6))]
    elif kind == "truncate":
        out = out[: max(0, len(out) - rng.randint(1, 6))]
    elif kind == "redraw":
        out = [f"all new {rng.random()}" for _ in range(rng.randint(0, 60))]
    elif kind == "spinner" and out:
        out[-1] = f"✻ Working… ({rng.randint(1, 99)}s)"
    return out


def test_patches_put_together_are_each_screen_byte_for_byte() -> None:
    rng = random.Random(7)  # noqa: S311 - screens, not secrets
    lines = [f"line {i}" for i in range(80)] + ["", "", "> ", "? for shortcuts"]
    for _ in range(2000):
        after = _next(rng, lines)
        ops = diff(lines, after)
        if ops is not None:
            assert "\n".join(apply(lines, ops)) == "\n".join(after)
        lines = after


def test_a_tall_screen_is_patched_in_well_under_a_millisecond_also_at_its_worst() -> None:
    busy = [f"\x1b[38;5;{i % 200}m{'x' * 200}\x1b[0m" for i in range(200)]
    blank_middle = ["header"] + [""] * 190 + ["> typed", "status"]  # many equal lines: difflib's worst case
    for before, after in (
        (busy, busy[3:] + ["a", "b", "c"]),  # scrolled
        (busy, busy[:100] + ["inserted"] + busy[100:-1]),  # a line above the input box
        (blank_middle, blank_middle[:-2] + ["> typed more", "status"]),  # only the bottom changes
    ):
        best = min(_timed(before, after) for _ in range(5))
        assert best < 0.001, f"{best * 1000:.2f} ms"
        ops = diff(before, after)
        assert ops is not None and "\n".join(apply(before, ops)) == "\n".join(after)


def _timed(before: list[str], after: list[str]) -> float:
    started = time.perf_counter()
    diff(before, after)
    return time.perf_counter() - started


class _Ws:
    app = None


def _connection(lines: bool) -> _Connection:
    conn = _Connection.__new__(_Connection)
    conn.patched, conn.patches_since_full = ({"s1": None} if lines else {}), {}
    return conn


def test_a_connection_gets_a_patch_only_on_the_screen_it_has() -> None:
    feed = ScreenFeed()
    screen = [f"a long line of output number {i}" for i in range(20)]
    first = feed.update("s1", "\n".join(screen))
    second = feed.update("s1", "\n".join([*screen, "d"]))
    third = feed.update("s1", "\n".join([*screen, "d", "e"]))
    assert second.base == first.seq and second.ops is not None

    fresh = _connection(lines=True)  # just subscribed: whole, numbered, then patches on it
    frame = fresh.screen_frame("s1", second)
    assert isinstance(frame, ScreenFrame) and frame.seq == second.seq
    patch = fresh.screen_frame("s1", third)
    assert isinstance(patch, ScreenPatchFrame) and (patch.base, patch.seq) == (second.seq, third.seq)

    missed = _connection(lines=True)  # it has the first, the patch is on the second: whole again
    missed.patched["s1"] = first.seq
    assert isinstance(missed.screen_frame("s1", third), ScreenFrame)

    old = _connection(lines=False)  # a client that never asked: whole screens, as always, no seq
    plain = old.screen_frame("s1", third)
    assert isinstance(plain, ScreenFrame) and plain.seq is None and plain.ansi == third.ansi


def test_a_patch_no_smaller_than_the_screen_is_a_screen() -> None:
    feed = ScreenFeed()
    feed.update("s1", "a")
    assert feed.update("s1", "b").ops is None  # all new: the whole one is as small
