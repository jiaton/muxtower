"""What is typed into a session shows at once: input (and hooks) wake the monitor instead of waiting for
its next tick."""

import asyncio
import time
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI

from muxtower.sessions.models import CreateSession
from muxtower.terminal.models import SendInput
from tests.fakes import FakeTmux


async def test_typing_shows_without_waiting_for_the_next_tick(app: FastAPI, tmux: FakeTmux, tmp_path: Path) -> None:
    session = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="w"))
    pane = next(p for p in tmux.panes.values() if p.info.session_name == session.tmux_session)
    pane.screen = "> "
    frames: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
    app.state.bus.subscribe(f"screen:{session.id}", frames)
    app.state.monitor.add_viewer(session.id, 0)
    loop = asyncio.create_task(app.state.monitor.run_loop(app.state.bus, 30.0))  # a tick only every 30 s
    try:
        await asyncio.wait_for(frames.get(), 5)  # the first tick
        pane.screen = "> hi"
        sent = time.monotonic()
        await asyncio.to_thread(app.state.terminal.send, session.id, SendInput(text="hi"))
        _, update = await asyncio.wait_for(frames.get(), 2)
        ansi = update.ansi
        assert "hi" in ansi and time.monotonic() - sent < 1.0

        # A burst of keys is taken together, and ticks stay apart however often something wakes it.
        def type_keys() -> None:
            for key in "abc":
                pane.screen += key
                app.state.terminal.send(session.id, SendInput(key=key))

        await asyncio.to_thread(type_keys)
        _, update = await asyncio.wait_for(frames.get(), 2)
        ansi = update.ansi
        assert ansi.endswith("abc") and frames.empty()
    finally:
        loop.cancel()


def test_a_pane_with_no_output_since_is_not_read_again_for_a_while(
    app: FastAPI, tmux: FakeTmux, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Each read is a tmux call (and, on a Mac, more): a quiet pane is read every few seconds, not every one."""
    import dataclasses

    from muxtower.sessions import monitor as monitor_module

    session = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="w"))
    pane = next(p for p in tmux.panes.values() if p.info.session_name == session.tmux_session)
    reads: list[str] = []
    capture = tmux.capture

    def counting(ref: Any, ansi: bool = False, history: int = 0) -> str | None:
        reads.append(ref.pane_id)
        return capture(ref, ansi, history)

    monkeypatch.setattr(tmux, "capture", counting)
    clock = {"wall": 1_000_000.5, "mono": 100.0}
    monkeypatch.setattr(monitor_module.time, "time", lambda: clock["wall"])
    monkeypatch.setattr(monitor_module.time, "monotonic", lambda: clock["mono"])
    monitor = app.state.monitor

    def tick(seconds: float, activity: int) -> int:
        clock["wall"] += seconds
        clock["mono"] += seconds
        pane.info = dataclasses.replace(pane.info, activity=activity)
        before = len(reads)
        monitor.tick()
        return len(reads) - before

    assert tick(0, 999_990) == 1  # first sight: read
    assert tick(1, 999_990) == 0  # no output since: not read
    assert tick(1, 1_000_001) == 1  # output in the second it was last read: read
    assert tick(1, 1_000_001) == 0
    monitor.add_viewer(session.id, 0)
    assert tick(1, 1_000_001) >= 1  # someone watches it: read every tick
    monitor.remove_viewer(session.id, 0)
    assert tick(1, 1_000_001) == 0
    assert tick(monitor_module.REREAD_SECONDS, 1_000_001) == 1  # read again now and then all the same
