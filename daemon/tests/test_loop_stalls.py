"""A slow tmux, a slow database (or a thread holding its lock) never stops the event loop: the API answers
meanwhile. And when something does block the loop, the watchdog says what."""

import asyncio
import logging
import threading
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.infra.watchdog import LoopWatchdog
from muxtower.search.indexer import DUTY, pause_after
from muxtower.sessions import monitor as monitor_module
from muxtower.terminal.ports import PaneInfo
from tests.fakes import FakeTmux

QUICK = 1.0  # seconds: what the API takes at most while something else is slow
HOLD = 2.5  # seconds the slow thing takes


@contextmanager
def held(lock: Any, seconds: float = HOLD) -> Iterator[threading.Thread]:
    """`lock` taken by another thread for `seconds` (a thread the OS seldom runs, holding the database)."""
    taken = threading.Event()

    def hold() -> None:
        with lock:
            taken.set()
            time.sleep(seconds)

    thread = threading.Thread(target=hold, daemon=True)
    thread.start()
    assert taken.wait(2)
    yield thread
    thread.join(seconds + 2)


def in_background(call: Callable[[], Any]) -> threading.Thread:
    thread = threading.Thread(target=call, daemon=True)
    thread.start()
    return thread


def answers_quickly(client: TestClient) -> float:
    began = time.monotonic()
    assert client.get("/v1/health").status_code == 200
    return time.monotonic() - began


def test_requests_that_wait_for_the_database_do_not_hold_up_the_api(
    app: FastAPI, client: TestClient, auth: dict[str, str]
) -> None:
    token = auth["Authorization"].removeprefix("Bearer ")
    hook = {"hook_event_name": "Stop"}
    hook_headers = {"Authorization": "Bearer some-hook-token", "X-Muxtower-Session": "nosuchsession"}

    def stream() -> None:
        with client.websocket_connect("/v1/stream", subprotocols=["muxtower", f"bearer.{token}"]) as ws:
            ws.send_json({"type": "ping"})
            ws.receive_json()

    with client, held(app.state.tokens.repo.db._lock):  # one event loop for every request (its portal)
        waiting = [
            in_background(lambda: client.post("/v1/hooks/claude-code", json=hook, headers=hook_headers)),
            in_background(stream),  # its token is checked in the database
            in_background(lambda: client.delete("/v1/sessions/nosuchsession", headers=auth)),
        ]
        time.sleep(0.3)  # they are waiting for the database now
        assert all(t.is_alive() for t in waiting)
        assert answers_quickly(client) < QUICK
        for thread in waiting:
            thread.join(5)
            assert not thread.is_alive()


class SlowTmux(FakeTmux):
    """Every listing hangs a while, as tmux does when its server or the machine is busy."""

    def __init__(self, seconds: float) -> None:
        super().__init__()
        self.seconds = seconds
        self.listing = 0
        self.most_at_once = 0
        self._count = threading.Lock()

    def list_panes(self, socket: str) -> list[PaneInfo]:
        with self._count:
            self.listing += 1
            self.most_at_once = max(self.most_at_once, self.listing)
        try:
            time.sleep(self.seconds)
            return super().list_panes(socket)
        finally:
            with self._count:
                self.listing -= 1


@pytest.fixture
def tmux() -> FakeTmux:
    return SlowTmux(HOLD)


def test_a_hanging_tick_holds_up_neither_the_api_nor_the_next_tick(
    app: FastAPI, client: TestClient, auth: dict[str, str], tmux: SlowTmux, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(monitor_module, "TICK_TIMEOUT", 0.3)  # it overruns several times over
    with client:  # one event loop for the monitor's loop and every request (its portal)
        assert client.portal is not None
        loop = client.portal.start_task_soon(app.state.monitor.run_loop, app.state.bus, 0.05)
        try:
            _hangs_meanwhile(client, auth, tmux)
        finally:
            loop.cancel()


def _hangs_meanwhile(client: TestClient, auth: dict[str, str], tmux: SlowTmux) -> None:
    deadline = time.monotonic() + 2
    while not tmux.listing and time.monotonic() < deadline:
        time.sleep(0.02)
    assert tmux.listing  # a tick hangs in tmux now
    assert answers_quickly(client) < QUICK
    began = time.monotonic()
    assert client.get("/v1/sessions", headers=auth).status_code == 200
    assert time.monotonic() - began < QUICK
    time.sleep(HOLD)  # it timed out more than once meanwhile
    assert tmux.most_at_once == 1  # never a second tick beside the one that hangs


def test_the_watchdog_says_what_blocks_the_loop(caplog: pytest.LogCaptureFixture) -> None:
    def stuck_on_purpose() -> None:
        time.sleep(0.8)

    async def run() -> int:
        watchdog = LoopWatchdog(threshold=0.3, beat=0.05)
        watchdog.start(asyncio.get_running_loop())
        try:
            await asyncio.sleep(0.2)
            stuck_on_purpose()  # on the loop: everything else waits
            await asyncio.sleep(0.3)
            await asyncio.sleep(0.3)  # quiet: no second report
            return watchdog.stalls
        finally:
            watchdog.stop()

    with caplog.at_level(logging.WARNING, logger="muxtower.watchdog"):
        assert asyncio.run(run()) == 1
    blocked = [r.getMessage() for r in caplog.records if "event loop blocked" in r.getMessage()]
    assert len(blocked) == 1 and "stuck_on_purpose" in blocked[0] and "other threads" in blocked[0]
    assert any("ran again after" in r.getMessage() for r in caplog.records)


def test_indexing_keeps_to_a_small_share_of_the_time() -> None:
    assert pause_after(0.0, 5.0) == 5.0
    assert pause_after(2.0, 5.0) == pytest.approx(2.0 * (1 - DUTY) / DUTY)  # a long round: a longer rest
