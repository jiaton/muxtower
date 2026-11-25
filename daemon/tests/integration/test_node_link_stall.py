"""A node's link survives a hub whose database is slow: what the node reports is kept off the hub's event loop,
so the hub still answers its HTTP and the link's keepalive pings (here made short, so a blocked loop would drop
it). On a starved machine the short pings can miss for other reasons: the HTTP check is the strict one."""

import threading
import time
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI

from muxtower.app import create_app
from muxtower.nodes import client as node_client
from tests.fakes import FakeTmux
from tests.integration.test_node_link import Running, _free_port, _settings, _until, hub  # noqa: F401 - fixture

HOLD = 5.0  # seconds the hub's database lock is held: well past the pong timeout below


def test_the_link_stays_up_while_the_hubs_database_is_held(
    hub: tuple[FastAPI, str],  # noqa: F811 - the fixture
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:  # fmt: skip
    monkeypatch.setattr(node_client, "PING_SECONDS", 0.5)
    monkeypatch.setattr(node_client, "PONG_SECONDS", 2.0)
    hub_app, hub_url = hub
    node_tmux = FakeTmux()
    node = create_app(_settings(tmp_path, "mac", _free_port()), tmux=node_tmux, run_loops=False)
    link = Running(node.state.hub.run_loop())
    try:
        code = hub_app.state.pairing.create_code("phone").code
        assert node.state.hub.join(hub_url, code).name == "mac"
        _until(lambda: node.state.hub.status().connected)
        connects: list[str] = []
        hub_app.state.nodes.linked.append(connects.append)

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
        time.sleep(2.0)  # pings after the hold too
        assert node.state.hub.status().connected and connects == []  # never dropped, never linked again
        assert hub_app.state.nodes.node("mac").online

        def kept() -> bool:
            hub_app.state.nodes.flush()
            record = next(r for r in hub_app.state.nodes.repo.list() if r.name == "mac")
            return any(s.get("name") == "work" for s in record.sessions)

        assert _until(kept)  # what it reported was kept once the database was free
    finally:
        link.stop()
