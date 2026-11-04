"""Reaching nodes without the hub: each node's https address (reported, or the owner's), a device token
each node makes for the hub's device over the link, revoked with that device (when a node is away: once it
is back), and a node that answers the hub's app across origins, also from a tailnet's private addresses."""

import asyncio
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.errors import Invalid
from muxtower.infra.bus import EventBus
from muxtower.infra.db import Database
from muxtower.nodes.direct import DirectAccess, app_origins, token_name, usable
from muxtower.nodes.hub import Nodes
from muxtower.nodes.protocol import PROTOCOL, Hello
from muxtower.nodes.repository import SqliteNodeRepository


class FakeLink:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.closed = False

    async def call(self, method: str, params: dict[str, Any], timeout: float) -> Any:
        self.calls.append((method, params))
        return None

    async def notify(self, method: str, params: dict[str, Any]) -> None:
        pass

    def close(self, code: int = 1000) -> None:
        self.closed = True


def _nodes(tmp_path: Path) -> Nodes:
    db = Database(tmp_path / "hub.db")
    db.migrate()
    nodes = Nodes(SqliteNodeRepository(db), EventBus())
    nodes.claim("mac")
    return nodes


def _hello(url: str | None) -> Hello:
    return Hello(protocol=PROTOCOL, name="mac", version="9", url=url)


def test_only_https_addresses_are_used() -> None:
    assert usable("https://mac.tailnet.ts.net/") == "https://mac.tailnet.ts.net"
    assert usable("http://10.0.0.5:8731") is None  # an https page cannot reach it
    assert usable(None) is None and usable("mac") is None


def test_the_node_says_where_it_is_and_the_owner_may_say_better(tmp_path: Path) -> None:
    nodes = _nodes(tmp_path)
    asyncio.run(nodes.attach("mac", FakeLink(), _hello("https://mac.tailnet.ts.net")))  # type: ignore[arg-type]
    direct = DirectAccess(nodes, lambda *_: None)
    (info,) = nodes.infos()
    assert info.reported_url == "https://mac.tailnet.ts.net" and info.direct_url is None
    assert direct.url_of(nodes.node("mac").record) == "https://mac.tailnet.ts.net"
    with pytest.raises(Invalid):
        direct.set_url("mac", "http://mac.local:8731")
    direct.set_url("mac", "https://mac.example.org")
    assert direct.url_of(nodes.node("mac").record) == "https://mac.example.org"  # the owner's, over the reported


def test_tokens_are_made_on_each_node_and_revoked_with_the_device_also_when_away(tmp_path: Path) -> None:
    nodes = _nodes(tmp_path)
    link = FakeLink()
    asyncio.run(nodes.attach("mac", link, _hello("https://mac.tailnet.ts.net")))  # type: ignore[arg-type]
    asked: list[tuple[str, str, dict[str, Any]]] = []

    def call(name: str, method: str, params: dict[str, Any]) -> Any:
        asked.append((name, method, params))
        return "mxt_direct" if method == "mint_token" else None

    direct = DirectAccess(nodes, call)
    (found,) = direct.tokens("Pixel")
    assert (found.node, found.url, found.token) == ("mac", "https://mac.tailnet.ts.net", "mxt_direct")
    assert asked[-1] == ("mac", "mint_token", {"name": token_name("Pixel")})

    direct.revoke("Pixel")  # online: at once
    assert asked[-1] == ("mac", "revoke_token", {"name": token_name("Pixel")})
    assert nodes.repo.revocations("mac") == ()

    nodes.detach("mac", link)  # away now
    direct.revoke("Phone")
    assert nodes.repo.revocations("mac") == (token_name("Phone"),)  # owed
    again = FakeLink()
    asyncio.run(nodes.attach("mac", again, _hello(None)))  # type: ignore[arg-type]
    assert ("revoke_token", {"name": token_name("Phone")}) in again.calls  # paid on reconnect
    assert nodes.repo.revocations("mac") == ()


def test_a_node_makes_only_direct_tokens_and_a_new_one_replaces_the_last(app: FastAPI) -> None:
    api = app.state.hub.api
    first = api.handle("mint_token", {"name": token_name("Pixel")})
    second = api.handle("mint_token", {"name": token_name("Pixel")})
    assert app.state.tokens.verify(second) and not app.state.tokens.verify(first)
    api.handle("revoke_token", {"name": token_name("Pixel")})
    assert not app.state.tokens.verify(second)
    with pytest.raises(Invalid):
        api.handle("mint_token", {"name": "Pixel"})  # never a token named like another device's


def test_the_hubs_app_may_call_a_node_and_a_private_address_is_answered(app: FastAPI) -> None:
    assert app_origins(["https://app.example"], "https://hub.example/") == [
        "https://app.example",
        "https://hub.example",
    ]
    assert app_origins(["*"], "https://hub.example") == ["*"]
    client = TestClient(app)
    preflight = client.options(
        "/v1/sessions",
        headers={
            "Origin": "https://hub.example", "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Private-Network": "true",
        },
    )  # fmt: skip
    assert preflight.headers.get("access-control-allow-private-network") == "true"
