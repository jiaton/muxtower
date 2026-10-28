"""A node on another build than its hub's installs the hub's wheel and starts again on it
(`nodes/release.py`): over a real link, with the install and the restart faked."""

import subprocess
import threading
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI

from muxtower.app import create_app
from muxtower.nodes.release import Build, sha256_of
from tests.fakes import FakeTmux
from tests.integration.test_node_link import Running, _free_port, _settings, _until, hub  # noqa: F401 - a fixture


def test_a_node_on_another_build_installs_the_hub_s(hub: tuple[FastAPI, str], tmp_path: Path) -> None:  # noqa: F811
    hub_app, hub_url = hub
    built = tmp_path / "dist" / "muxtower-0.1.0.dev0-py3-none-any.whl"
    built.parent.mkdir()
    built.write_bytes(b"PK the hub's build")
    hub_app.state.release.build = Build(sha256_of(built), built)

    node = create_app(_settings(tmp_path, "mac", _free_port()), tmux=FakeTmux(), run_loops=False)
    release = node.state.release
    release.build = Build("0" * 64, tmp_path / "old.whl")
    ran: list[list[str]] = []
    restarted = threading.Event()

    def run(command: list[str], **_: Any) -> subprocess.CompletedProcess[str]:
        ran.append(command)
        return subprocess.CompletedProcess(command, 0, "", "")

    release.run, release.restart = run, restarted.set
    link = Running(node.state.hub.run_loop())
    try:
        node.state.hub.join(hub_url, hub_app.state.pairing.create_code("phone").code)
        assert restarted.wait(10)
        installed = Path(ran[0][-1])
        assert installed.name == built.name and installed.read_bytes() == b"PK the hub's build"
        assert _until(lambda: hub_app.state.nodes.infos()[0].version) == "0.1.0.dev0+000000000000"

        # The hub hands out the build it runs, not one built since and not installed yet.
        built.write_bytes(b"PK a newer build")
        token = node.state.hub.store.load().token
        got = httpx.get(f"{hub_url}/v1/nodes/release", headers={"Authorization": f"Bearer {token}"})
        assert got.status_code == 200 and got.content == b"PK the hub's build"
        _, device = hub_app.state.tokens.create("phone")
        for headers in ({}, {"Authorization": f"Bearer {device}"}):  # a node's token only
            assert httpx.get(f"{hub_url}/v1/nodes/release", headers=headers).status_code == 401
    finally:
        link.stop()


def test_a_node_takes_only_another_well_formed_build(tmp_path: Path) -> None:
    from muxtower.nodes.release import Release

    release = Release(tmp_path, build=Build("a" * 64, tmp_path / "x.whl"))
    offer = {"sha256": "b" * 64, "wheel": "muxtower-0.1.0.dev0-py3-none-any.whl"}
    assert release.wanted(offer) == ("b" * 64, offer["wheel"])
    assert release.wanted({**offer, "sha256": "a" * 64}) is None  # its own
    assert release.wanted({**offer, "wheel": "../evil.whl"}) is None
    assert Release(tmp_path, auto_update=False, build=release.build).wanted(offer) is None
    assert Release(tmp_path).wanted(offer) is None  # a source checkout
    assert Release(tmp_path).offer() is None


def test_the_build_is_the_hash_of_the_wheel_it_was_installed_from(monkeypatch: Any) -> None:
    import importlib.metadata

    from muxtower.nodes import release

    class Installed:
        def __init__(self, raw: str | None) -> None:
            self.raw = raw

        def read_text(self, name: str) -> str | None:
            return self.raw

    def with_record(raw: str | None) -> Build | None:
        monkeypatch.setattr(importlib.metadata, "distribution", lambda _: Installed(raw))
        return release.installed()

    sha = "c" * 64
    wheel = '"url": "file:///srv/my%20dist/muxtower-0.1.0.dev0-py3-none-any.whl"'
    assert with_record(f'{{"archive_info": {{"hashes": {{"sha256": "{sha}"}}}}, {wheel}}}') == Build(
        sha, Path("/srv/my dist/muxtower-0.1.0.dev0-py3-none-any.whl")
    )
    assert with_record(f'{{"archive_info": {{"hash": "sha256={sha}"}}, {wheel}}}') is not None  # older pip
    assert with_record('{"dir_info": {"editable": true}, "url": "file:///src/daemon"}') is None
    assert with_record(None) is None
