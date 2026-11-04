"""Feature settings from the app: over the defaults, under the config file (whose keys are not changed
here), applied at once or at the next start as each says, audited, and a node's through its hub."""

from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.config import load_settings
from muxtower.errors import Invalid
from muxtower.settings.catalog import FIELDS


def _client(app: FastAPI) -> tuple[TestClient, dict[str, str]]:
    _, token = app.state.tokens.create("phone")
    return TestClient(app), {"Authorization": f"Bearer {token}"}


def _by_key(listed: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {s["key"]: s for s in listed["settings"]}


def test_only_features_are_listed_never_what_starts_the_daemon_or_is_secret() -> None:
    keys = {f.key for f in FIELDS}
    assert "recovery.mode" in keys and "concierge.enabled" in keys
    for kept_out in ("host", "port", "public_url", "pairing", "cors", "hub", "trusted_proxies", "api_key", "token"):
        assert not any(kept_out in key for key in keys), kept_out


def test_a_change_that_applies_now_applies_at_once_and_stays_after_a_restart(
    make_app: Callable[..., FastAPI],
) -> None:
    app = make_app()
    client, auth = _client(app)
    listed = client.patch("/v1/settings", json={"values": {"recovery.mode": "auto"}}, headers=auth).json()
    mode = _by_key(listed)["recovery.mode"]
    assert (mode["value"], mode["source"], mode["pending"]) == ("auto", "app", False)
    assert app.state.recovery.settings.mode == "auto"  # the running service reads it
    assert make_app().state.recovery.settings.mode == "auto"  # and the next start puts it back


def test_one_that_needs_a_restart_waits_for_it_and_says_so(make_app: Callable[..., FastAPI]) -> None:
    app = make_app()
    client, auth = _client(app)
    listed = client.patch("/v1/settings", json={"values": {"summaries.min_chars": "800"}}, headers=auth).json()
    chars = _by_key(listed)["summaries.min_chars"]
    assert (chars["value"], chars["applies"], chars["pending"]) == (800, "restart", True)
    assert app.state.summaries.min_chars == 400  # the running service as it was built
    again = make_app()
    assert again.state.summaries.min_chars == 800
    assert not _by_key({"settings": [s.model_dump() for s in again.state.feature_settings.views()]})[
        "summaries.min_chars"
    ]["pending"]


def test_what_the_config_file_sets_is_shown_as_its_and_not_changed(
    tmp_path: Path, make_app: Callable[..., FastAPI]
) -> None:
    app = make_app(**{"usage.rss_mb": 900})  # an override counts as the file's
    client, auth = _client(app)
    rss = _by_key(client.get("/v1/settings", headers=auth).json())["usage.rss_mb"]
    assert (rss["value"], rss["source"]) == (900, "config_file")
    refused = client.patch("/v1/settings", json={"values": {"usage.rss_mb": 100}}, headers=auth)
    assert refused.status_code == 409 and "config file" in refused.json()["detail"]

    toml = tmp_path / "config.toml"
    toml.write_text('[recovery]\nmode = "off"\n')
    from_file = load_settings(config_file=toml, env={})
    assert "recovery.mode" in from_file.set_by_file
    assert "recovery.mode" not in load_settings(tmp_path / "x", {}).set_by_file


def test_all_or_nothing_and_null_is_the_default_again(make_app: Callable[..., FastAPI]) -> None:
    app = make_app()
    client, auth = _client(app)
    bad = {"values": {"recovery.mode": "auto", "usage.rss_mb": "lots"}}
    assert client.patch("/v1/settings", json=bad, headers=auth).status_code == 400
    assert client.patch("/v1/settings", json={"values": {"pairing.mode": "x"}}, headers=auth).status_code == 400
    assert app.state.recovery.settings.mode == "ask"  # nothing changed
    client.patch("/v1/settings", json={"values": {"recovery.mode": "off"}}, headers=auth)
    listed = client.patch("/v1/settings", json={"values": {"recovery.mode": None}}, headers=auth).json()
    assert (_by_key(listed)["recovery.mode"]["source"], app.state.recovery.settings.mode) == ("default", "ask")
    with app.state.audit.db.connect() as conn:
        rows = conn.execute("SELECT actor, detail FROM audit_log WHERE action = 'settings'").fetchall()
    expected = [("phone", 'recovery.mode="off"'), ("phone", "recovery.mode=null")]
    assert [(r["actor"], r["detail"]) for r in rows] == expected


def test_a_hub_reads_and_changes_a_nodes_settings_over_the_link(
    make_app: Callable[..., FastAPI], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    node = make_app(state_dir=tmp_path / "node")
    hub = make_app(state_dir=tmp_path / "hub")
    asked: list[tuple[str, str]] = []

    def over_the_link(name: str, method: str, params: dict[str, Any], timeout: float = 20) -> Any:
        asked.append((name, method))
        return node.state.hub.api.handle(method, params)

    monkeypatch.setattr(hub.state.node_sessions, "call", over_the_link)
    client, auth = _client(hub)
    listed = client.patch(
        "/v1/settings", params={"node": "laptop"}, json={"values": {"recovery.mode": "auto"}}, headers=auth
    ).json()
    assert listed["machine"] == "laptop" and _by_key(listed)["recovery.mode"]["value"] == "auto"
    assert node.state.recovery.settings.mode == "auto" and hub.state.recovery.settings.mode == "ask"
    assert asked == [("laptop", "set_settings")]

    def old_node(*_: Any, **__: Any) -> Any:
        raise Invalid("unknown method settings")

    monkeypatch.setattr(hub.state.node_sessions, "call", old_node)
    old = client.get("/v1/settings", params={"node": "laptop"}, headers=auth)
    assert old.status_code == 409 and "update it first" in old.json()["detail"]
