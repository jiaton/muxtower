"""This daemon as a node of a hub: joining it once, then keeping one link open to it, whatever restarts.

The node always dials out (`wss://<hub>/v1/nodes/link`), so it needs no address of its own that the
hub or a phone could reach: a laptop behind any network works. Extra headers from the config go with
every request to the hub, for a gate in front of it. The link says hello, reports the sessions here
whole on every change (and every minute, should a change have been missed), forwards conversation items
as the stream here has them and the screens the hub watches, and answers the hub's requests
(`NodeApi`). When it drops, it is opened again, backing off up to half a minute; a hub that no longer
knows this node closes it with CLOSE_REVOKED, and the node forgets the hub."""

import asyncio
import logging
import random
from collections.abc import Callable

import httpx
from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import ConnectionClosed, InvalidStatus, WebSocketException
from websockets.typing import Subprotocol

from muxtower.errors import Conflict, Invalid, Unavailable
from muxtower.infra.bus import EventBus
from muxtower.nodes import protocol
from muxtower.nodes.api import NodeApi
from muxtower.nodes.models import HubStatus, NodeClaimResult
from muxtower.nodes.session import LinkSession
from muxtower.nodes.store import HubStore, Joined
from muxtower.sessions.monitor import Monitor

logger = logging.getLogger("muxtower.hub")

MAX_BACKOFF_SECONDS = 30.0


def link_url(hub: str) -> str:
    return "ws" + hub.rstrip("/").removeprefix("http") + "/v1/nodes/link"


class HubClient:
    def __init__(
        self, store: HubStore, headers: dict[str, str], api: NodeApi, monitor: Monitor, bus: EventBus,
        hello: Callable[[], protocol.Hello],
    ) -> None:  # fmt: skip
        self.store = store
        self.headers = headers
        self.api = api
        self.monitor = monitor
        self.bus = bus
        self.hello = hello
        self.connected = False
        self.error: str | None = None
        self._wake: asyncio.Event | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._ws: ClientConnection | None = None

    # --- joining (blocking, from a request thread) --------------------------------------------

    def status(self) -> HubStatus:
        joined = self.store.load()
        if joined is None:
            return HubStatus()
        return HubStatus(url=joined.url, name=joined.name, connected=self.connected, error=self.error)

    def join(self, url: str, code: str) -> HubStatus:
        """Redeems a pairing code made on the hub for this node's own token, then links."""
        url = url.rstrip("/")
        try:
            response = httpx.post(
                f"{url}/v1/nodes/claim",
                json={"code": code, "name": self.hello().name},
                headers=self.headers,
                timeout=8,  # within the 10 s the CLI waits
            )
        except httpx.HTTPError as exc:
            raise Unavailable(f"cannot reach the hub: {exc}") from exc
        if response.status_code in (401, 404, 429):
            detail = response.json().get("detail", "") if "json" in response.headers.get("content-type", "") else ""
            raise Invalid(detail or f"the hub refused the code ({response.status_code})")
        if response.status_code != 200:
            raise Unavailable(f"the hub answered {response.status_code}; is a gate in front of it ([hub] headers)?")
        claimed = NodeClaimResult.model_validate(response.json())
        self.store.save(Joined(url=url, name=claimed.name, token=claimed.token))
        self.error = None
        self._poke()
        return self.status()

    def leave(self) -> None:
        if self.store.load() is None:
            raise Conflict("this daemon has not joined a hub")
        self.store.clear()
        self._poke()

    def _poke(self) -> None:
        """Wakes the loop: to link now, or to drop a link it should no longer have."""
        if self._loop is None:
            return
        self._loop.call_soon_threadsafe(self._wake_now)

    def _wake_now(self) -> None:
        if self._wake is not None:
            self._wake.set()
        if self._ws is not None and self.store.load() is None:
            asyncio.ensure_future(self._ws.close())

    # --- the link (event loop) ----------------------------------------------------------------

    async def run_loop(self) -> None:
        self._loop = asyncio.get_running_loop()
        self._wake = asyncio.Event()
        backoff = 1.0
        while True:
            self._wake.clear()
            joined = self.store.load()
            if joined is None:
                self.connected = False
                await self._wake.wait()
                continue
            try:
                await self._link(joined)
                backoff = 1.0
            except ConnectionClosed as exc:
                if exc.rcvd is not None and exc.rcvd.code == protocol.CLOSE_REVOKED:
                    logger.warning("the hub %s no longer knows this node; join it again", joined.url)
                    self.error = "the hub removed this node: join it again"
                    self.store.clear()
                    continue
                self.error = f"link closed ({exc.rcvd.code if exc.rcvd else 'no close frame'})"
            except InvalidStatus as exc:
                self.error = f"the hub answered {exc.response.status_code}"
            except (OSError, TimeoutError, WebSocketException) as exc:
                self.error = f"cannot reach the hub: {exc}"
            except Exception as exc:
                logger.exception("hub link failed")
                self.error = str(exc)
            self.connected = False
            delay = backoff + random.uniform(0, backoff / 2)  # noqa: S311 - jitter, not security
            backoff = min(backoff * 2, MAX_BACKOFF_SECONDS)
            try:
                await asyncio.wait_for(self._wake.wait(), delay)
            except TimeoutError:
                pass

    async def _link(self, joined: Joined) -> None:
        subprotocols = [Subprotocol("muxtower"), Subprotocol(f"bearer.{joined.token}")]
        async with connect(
            link_url(joined.url), additional_headers=self.headers, subprotocols=subprotocols,
            max_size=protocol.MAX_FRAME_BYTES, open_timeout=20, ping_interval=20, ping_timeout=20,
        ) as ws:  # fmt: skip
            self._ws = ws
            self.connected, self.error = True, None
            logger.info("linked to the hub %s as %s", joined.url, joined.name)
            try:
                await LinkSession(ws, self.api, self.monitor, self.bus, self.hello).run()
            finally:
                self._ws = None
