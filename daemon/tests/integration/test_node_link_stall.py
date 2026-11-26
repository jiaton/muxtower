"""A node's link survives a hub whose database is slow: what the node reports is kept off the hub's event loop,
so the hub still answers its HTTP and the link's keepalive pings (here made short, so a blocked loop would drop
it). On a starved machine the short pings can miss for other reasons: the HTTP check is the strict one.

The hub reads a link's frames while it welcomes the node (screens watched again, devices revoked while it was
away), which waits on the database and on the node's answers: uvicorn stops reading a socket while a frame waits
unread, so a welcome before the reading left the node's pings unanswered (a link dropped at once in a slow
moment) and its own questions unanswerable."""

import threading
import time
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI

from muxtower.app import create_app
from muxtower.nodes import client as node_client
from muxtower.nodes.direct import token_name
from tests.fakes import FakeTmux
from tests.integration.test_node_link import Running, _free_port, _settings, _until, hub  # noqa: F401 - fixture

HOLD = 8.0  # seconds the hub's database lock is held: twice the pong timeout below


def test_the_link_stays_up_while_the_hubs_database_is_held(
    hub: tuple[FastAPI, str],  # noqa: F811 - the fixture
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:  # fmt: skip
    # Short enough that the hold spans two pong timeouts, wide enough that a loaded machine (CI, the shared NAS)
    # does not miss a pong on its own (0.5 / 2.0 did, 2 reconnects at load ~6).
    monkeypatch.setattr(node_client, "PING_SECONDS", 1.0)
    monkeypatch.setattr(node_client, "PONG_SECONDS", 4.0)
    hub_app, hub_url = hub
    node_tmux = FakeTmux()
    node = create_app(_settings(tmp_path, "mac", _free_port()), tmux=node_tmux, run_loops=False)
    link = Running(node.state.hub.run_loop())
    try:
        # Every link the hub takes, from the first: the node says connected once its socket opens, before the
        # hub has taken the link, so listening only after that would hear the first one late, as a second.
        connects: list[str] = []
        hub_app.state.nodes.linked.append(connects.append)
        code = hub_app.state.pairing.create_code("phone").code
        assert node.state.hub.join(hub_url, code).name == "mac"
        _until(lambda: node.state.hub.status().connected and connects == ["mac"])
        connects.clear()

        taken, released = threading.Event(), threading.Event()

        def hold() -> None:
            with hub_app.state.tokens.repo.db._lock:  # a thread the OS seldom runs, holding the database
                taken.set()
                time.sleep(HOLD)
            released.set()

        threading.Thread(target=hold, daemon=True).start()
        assert taken.wait(2)
        node_tmux.add_pane("default", "work", "claude")
        node.state.monitor.tick()
        link.call(node.state.bus.publish, "sessions", None)  # the node reports: the hub keeps it
        while not released.wait(0.2):
            began = time.monotonic()
            assert httpx.get(f"{hub_url}/v1/health", timeout=10).status_code == 200
            assert time.monotonic() - began < 1.0  # the hub's event loop runs meanwhile
            assert node.state.hub.status().connected
        time.sleep(4.0)  # pings after the hold too
        assert node.state.hub.status().connected and connects == []  # never dropped, never linked again
        assert hub_app.state.nodes.node("mac").online

        def kept() -> bool:
            hub_app.state.nodes.flush()
            record = next(r for r in hub_app.state.nodes.repo.list() if r.name == "mac")
            return any(s.get("name") == "work" for s in record.sessions)

        assert _until(kept)  # what it reported was kept once the database was free
    finally:
        link.stop()


def test_a_node_is_welcomed_while_its_frames_are_read(
    hub: tuple[FastAPI, str],  # noqa: F811 - the fixture
    tmp_path: Path,
) -> None:  # fmt: skip
    # A device revoked while the node was away is revoked there as it links again: the hub asks, and the node's
    # answer can only be read by the link's own reading. Asked before that reading started, it waited 20 s.
    hub_app, hub_url = hub
    node = create_app(_settings(tmp_path, "mac", _free_port()), tmux=FakeTmux(), run_loops=False)
    link = Running(node.state.hub.run_loop())
    try:
        code = hub_app.state.pairing.create_code("phone").code
        assert node.state.hub.join(hub_url, code).name == "mac"
        nodes = hub_app.state.nodes
        _until(lambda: node.state.hub.status().connected and nodes.node("mac").online)
        owed = token_name("Pixel")
        nodes.repo.owe_revocation("mac", owed)
        dropped = nodes.node("mac").link
        assert nodes.loop is not None and dropped is not None
        nodes.loop.call_soon_threadsafe(dropped.close)  # it links again, owed a revocation
        began = time.monotonic()
        _until(lambda: nodes.node("mac").link not in (None, dropped))
        _until(lambda: nodes.repo.revocations("mac") == (), seconds=10)
        assert time.monotonic() - began < 10
        assert node.state.hub.status().connected
    finally:
        link.stop()
