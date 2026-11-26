"""Plan usage over a real link: a node reads its plans only while its hub's setting is on, and what it reads is
listed by the hub with the node as the machine using it."""

from datetime import UTC, datetime
from pathlib import Path

import httpx
from fastapi import FastAPI

from muxtower.app import create_app
from muxtower.subscriptions.reader import PlanReader
from tests.fakes import FakeTmux
from tests.integration.test_node_link import Running, _free_port, _settings, _until, hub  # noqa: F401 - fixture
from tests.plan_fakes import FakeApi, FakeLogins


def test_a_node_reports_its_plans_to_its_hub_and_follows_its_setting(
    hub: tuple[FastAPI, str],  # noqa: F811 - the fixture
    tmp_path: Path,
) -> None:  # fmt: skip
    hub_app, hub_url = hub
    _, token = hub_app.state.tokens.create("phone")
    phone = httpx.Client(base_url=hub_url, headers={"Authorization": f"Bearer {token}"}, timeout=10)
    node = create_app(_settings(tmp_path, "mac", _free_port()), tmux=FakeTmux(), run_loops=False)
    reader: PlanReader = node.state.plan_reader
    api = FakeApi()
    reader.logins, reader.api = FakeLogins(datetime.now(UTC)), api
    link = Running(node.state.hub.run_loop())
    try:
        code = hub_app.state.pairing.create_code("phone").code
        assert node.state.hub.join(hub_url, code).name == "mac"
        _until(lambda: node.state.hub.plan_usage is True)  # the hub said so as it linked
        reader.tick()

        def listed() -> list[dict[str, object]]:
            accounts: list[dict[str, object]] = phone.get("/v1/plan-usage").json()["accounts"]
            return accounts if len(accounts) == 2 else []

        claude, codex = _until(listed)
        assert claude["provider"] == "claude" and claude["machines"][0]["machine"] == "mac"  # type: ignore[index]
        assert codex["plan"] == "plus"

        assert phone.patch("/v1/settings", json={"values": {"plan_usage.enabled": False}}).status_code == 200
        _until(lambda: node.state.hub.plan_usage is False)
        api.calls.clear()
        reader.tick()
        assert api.calls == [] and reader.reports() == []
        assert phone.get("/v1/plan-usage").json() == {"enabled": False, "accounts": []}

        phone.patch("/v1/settings", json={"values": {"plan_usage.enabled": True}})
        _until(lambda: node.state.hub.plan_usage is True)
        reader.tick()
        assert _until(listed)
    finally:
        link.stop()
        phone.close()
