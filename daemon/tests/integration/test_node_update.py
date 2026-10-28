"""A node keeps to its hub's version (`nodes/update.py`): over a real link, with the install from PyPI
and the restart faked."""

import subprocess
import threading
from pathlib import Path
from typing import Any

from fastapi import FastAPI

from muxtower import __version__
from muxtower.app import create_app
from muxtower.nodes.protocol import PROTOCOL, Hello, agree
from muxtower.nodes.update import RETRY_SECONDS, Policy, Updater, newer
from tests.fakes import FakeTmux
from tests.integration.test_node_link import Running, _free_port, _settings, _until, hub  # noqa: F401 - a fixture


def _node(
    tmp_path: Path, policy: Policy, protocol: int, oldest: int | None = None
) -> tuple[FastAPI, list[list[str]], threading.Event]:
    node = create_app(_settings(tmp_path, "mac", _free_port()), tmux=FakeTmux(), run_loops=False)
    client = node.state.hub
    client.hello = lambda: Hello(protocol=protocol, oldest=oldest, name="mac", version="0.0.9")
    updater = client.updater
    updater.policy, updater.version, updater.source = policy, "0.0.9", False
    ran: list[list[str]] = []
    restarted = threading.Event()

    def run(command: list[str], **_: Any) -> subprocess.CompletedProcess[str]:
        ran.append(command)
        return subprocess.CompletedProcess(command, 0, "", "")

    updater.run, updater.restart = run, restarted.set
    return node, ran, restarted


def _join(hub_app: FastAPI, hub_url: str, node: FastAPI) -> None:
    node.state.hub.join(hub_url, hub_app.state.pairing.create_code("phone").code)


def test_a_node_the_hub_refuses_installs_the_hub_s_version(hub: tuple[FastAPI, str], tmp_path: Path) -> None:  # noqa: F811
    hub_app, hub_url = hub
    node, ran, restarted = _node(tmp_path, "incompatible", PROTOCOL + 1)
    link = Running(node.state.hub.run_loop())
    try:
        _join(hub_app, hub_url, node)
        assert restarted.wait(10)
        assert ran[0][-1] == f"muxtower=={__version__}"
        assert _until(lambda: node.state.hub.status().error) == (
            f"the hub runs muxtower {__version__}: run `pipx install --force muxtower=={__version__}` here"
        )  # had it not restarted
    finally:
        link.stop()


def test_an_older_node_is_told_and_follows_only_when_it_always_does(
    hub: tuple[FastAPI, str],  # noqa: F811
    tmp_path: Path,
) -> None:
    hub_app, hub_url = hub
    node, ran, _ = _node(tmp_path, "incompatible", PROTOCOL)
    link = Running(node.state.hub.run_loop())
    try:
        _join(hub_app, hub_url, node)
        status = _until(lambda: (s := node.state.hub.status()).connected and s.hub_version and s)
        assert status.update == __version__ and ran == []
        assert [(n.version, n.update) for n in hub_app.state.nodes.infos()] == [("0.0.9", __version__)]
    finally:
        link.stop()

    always, ran, restarted = _node(tmp_path / "always", "always", PROTOCOL)
    link = Running(always.state.hub.run_loop())
    try:
        _join(hub_app, hub_url, always)
        assert restarted.wait(10) and ran[0][-1] == f"muxtower=={__version__}"
    finally:
        link.stop()


def test_a_newer_node_that_still_speaks_the_hub_s_protocol_links(
    hub: tuple[FastAPI, str],  # noqa: F811
    tmp_path: Path,
) -> None:
    hub_app, hub_url = hub
    node, ran, _ = _node(tmp_path, "incompatible", PROTOCOL + 1, oldest=PROTOCOL)
    link = Running(node.state.hub.run_loop())
    try:
        _join(hub_app, hub_url, node)
        assert _until(lambda: node.state.hub.status().connected)
        assert ran == [] and node.state.hub.status().error is None
    finally:
        link.stop()


def test_a_link_speaks_the_older_side_s_protocol_while_both_still_speak_it() -> None:
    assert agree(PROTOCOL, None) == PROTOCOL
    assert agree(PROTOCOL + 1, PROTOCOL) == PROTOCOL  # a newer node talks down
    assert agree(PROTOCOL + 1, None) is None  # one that no longer speaks this hub's protocol
    assert agree(PROTOCOL - 1, None) is None  # older than this hub still speaks (OLDEST)


def test_versions_compare_as_releases() -> None:
    assert newer("0.1.0", "0.1.0.dev0") and newer("0.10.0", "0.9.9") and newer("1.0.0rc1", "1.0.0b2")
    assert not newer("1.0", "1.0.0") and not newer("0.1.0", "0.2.0")
    assert not newer("main", "0.1.0") and not newer("0.1.0", None)


def test_a_failed_install_is_tried_again_later() -> None:  # PyPI may serve a release minutes late
    updater, now = Updater("always", version="0.1.0"), [0.0]
    updater.source, updater.clock = False, lambda: now[0]
    updater.run = lambda command, **_: subprocess.CompletedProcess(command, 1, "", "No matching distribution")
    assert updater.heard({"version": "0.1.1"}) == "0.1.1"
    updater.install("0.1.1")
    assert updater.heard() is None
    now[0] += RETRY_SECONDS
    assert updater.heard() == "0.1.1"
