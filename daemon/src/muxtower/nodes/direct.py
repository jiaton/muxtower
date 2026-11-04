"""Reaching a node without its hub: while the hub's machine is down, the app talks to the nodes it knows
directly, at the address each reports (its `public_url`, else what `tailscale serve` serves it at, if
anything) or the owner set on the hub, with a device token each node made for it over the link while the
hub was up. muxtower makes no ingress of its own: that address is the owner's (Tailscale serve, or a tunnel
on the node). Only https addresses are used: an https page cannot call http.

Not a second hub: nothing is synced, and team data stays the hub's (a node refuses to change it alone)."""

import json
import logging
import shutil
import subprocess
from collections.abc import Callable
from typing import TYPE_CHECKING, Any
from urllib.parse import urlsplit

from pydantic import BaseModel, Field

from muxtower.errors import Conflict, Invalid, Unavailable

if TYPE_CHECKING:
    from muxtower.nodes.hub import Nodes
    from muxtower.nodes.repository import NodeRecord

logger = logging.getLogger("muxtower.nodes")
Call = Callable[[str, str, dict[str, Any]], Any]

TOKEN_PREFIX = "direct:"  # noqa: S105 - a name prefix, not a secret. A node's device token for a hub device: `direct:<that device's name>`


def token_name(device: str) -> str:
    return f"{TOKEN_PREFIX}{device}"


def usable(url: str | None) -> str | None:
    """The address as the app may use it: https only, without a trailing slash."""
    if not url:
        return None
    parts = urlsplit(url.strip())
    return url.strip().rstrip("/") if parts.scheme == "https" and parts.netloc else None


def tailscale_url(port: int) -> str | None:
    """Blocking. Where `tailscale serve` serves this port over https on the tailnet, if it does."""
    binary = shutil.which("tailscale")
    if binary is None:
        return None
    try:
        out = subprocess.run(  # noqa: S603 - a fixed command
            [binary, "serve", "status", "--json"], capture_output=True, text=True, timeout=5, check=False
        ).stdout
        web = json.loads(out or "{}").get("Web") or {}
    except (OSError, subprocess.SubprocessError, ValueError):
        return None
    for host, served in web.items():
        for handler in (served.get("Handlers") or {}).values():
            proxy = str(handler.get("Proxy") or "")
            if proxy.rstrip("/").endswith(f":{port}"):
                name, _, listen = host.partition(":")
                return f"https://{name}" + ("" if listen in ("", "443") else f":{listen}")
    return None


class DirectAccess:
    """On the hub: each node's address for the app, and its device tokens for the app's devices."""

    def __init__(self, nodes: "Nodes", call: "Call") -> None:
        self.nodes = nodes
        self.call = call  # asks a node over its link (blocking)

    def url_of(self, record: "NodeRecord") -> str | None:
        return usable(record.direct_url) or usable(record.reported_url)

    def set_url(self, name: str, url: str | None) -> None:
        """The owner's address for a node (None: the one it reports)."""
        if url and not usable(url):
            raise Invalid("a node's address must be https: an https page cannot reach http")
        node = self.nodes.node(name)
        node.record.direct_url = url.rstrip("/") if url else None
        self.nodes.repo.save(node.record)

    def tokens(self, device: str) -> list["DirectNode"]:
        """Blocking. A device token on every connected node with an address, for `device` (made anew)."""
        found = []
        for name, node in sorted(self.nodes.all().items()):
            url = self.url_of(node.record)
            if not url or not node.online:
                continue
            try:
                token = self.call(name, "mint_token", {"name": token_name(device)})
            except (Conflict, Invalid, Unavailable, TimeoutError) as exc:  # an older node, or one just gone
                logger.info("no direct token from %s: %s", name, exc)
                continue
            found.append(DirectNode(node=name, url=url, token=str(token)))
        return found

    def revoke(self, device: str) -> None:
        """Blocking. Its tokens on every node: now where connected, else as soon as it connects again."""
        for name, node in self.nodes.all().items():
            self.nodes.repo.owe_revocation(name, token_name(device))
            if node.online:
                try:
                    self.call(name, "revoke_token", {"name": token_name(device)})
                    self.nodes.repo.revoked(name, token_name(device))
                except (Conflict, Invalid, Unavailable, TimeoutError) as exc:
                    logger.info("revoking on %s when it is back: %s", name, exc)


class DirectNode(BaseModel):
    node: str
    url: str = Field(description="https: where the app reaches it itself")
    token: str = Field(description="a device token of that node, for this device")


def app_origins(allowed: list[str], hub_url: str | None) -> list[str]:
    """Origins a daemon answers across origins: its configured ones, and its hub's app (whose pages reach
    it directly while the hub is down), learnt from the link it joined."""
    origins = list(allowed)
    if hub_url and "*" not in origins:
        parts = urlsplit(hub_url)
        origins.append(f"{parts.scheme}://{parts.netloc}")
    return origins


class PrivateNetworkAccess:
    """Answers Chrome's Private Network Access preflight: a tailnet name resolves to a private address
    (100.64/10), so a page elsewhere must be told it may call it (`Access-Control-Allow-Private-Network`)."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        asks = (
            scope["type"] == "http"
            and scope.get("method") == "OPTIONS"
            and any(k == b"access-control-request-private-network" for k, _ in scope.get("headers", []))
        )
        if not asks:
            await self.app(scope, receive, send)
            return

        async def answer(message: Any) -> None:
            if message["type"] == "http.response.start":
                message["headers"] = [*message.get("headers", []), (b"access-control-allow-private-network", b"true")]
            await send(message)

        await self.app(scope, receive, answer)
