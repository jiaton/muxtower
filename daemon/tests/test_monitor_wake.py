"""What is typed into a session shows at once: input (and hooks) wake the monitor instead of waiting for
its next tick."""

import asyncio
import time
from pathlib import Path
from typing import Any

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
        _, ansi = await asyncio.wait_for(frames.get(), 2)
        assert "hi" in ansi and time.monotonic() - sent < 1.0

        # A burst of keys is taken together, and ticks stay apart however often something wakes it.
        def type_keys() -> None:
            for key in "abc":
                pane.screen += key
                app.state.terminal.send(session.id, SendInput(key=key))

        await asyncio.to_thread(type_keys)
        _, ansi = await asyncio.wait_for(frames.get(), 2)
        assert ansi.endswith("abc") and frames.empty()
    finally:
        loop.cancel()
