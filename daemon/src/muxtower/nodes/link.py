"""One node's link, as the hub holds it: requests out, their answers matched back (on the event loop)."""

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from muxtower.errors import Unavailable
from muxtower.nodes import protocol

logger = logging.getLogger("muxtower.nodes")


class NodeLink:
    def __init__(
        self, name: str, send: Callable[[str], Awaitable[None]], hangup: Callable[[int], Awaitable[None]]
    ) -> None:
        self.name = name
        self._send = send
        self._hangup = hangup
        self._pending: dict[int, asyncio.Future[Any]] = {}
        self._next = 0
        self.closed = False

    async def call(self, method: str, params: dict[str, Any], timeout: float) -> Any:
        if self.closed:
            raise Unavailable(f"{self.name} is not connected")
        self._next += 1
        request_id = self._next
        answer: asyncio.Future[Any] = asyncio.get_running_loop().create_future()
        self._pending[request_id] = answer
        try:
            await self._send(protocol.request(request_id, method, params))
            return await asyncio.wait_for(answer, timeout)
        except TimeoutError as exc:
            raise Unavailable(f"{self.name} did not answer in time") from exc
        finally:
            self._pending.pop(request_id, None)

    async def notify(self, method: str, params: dict[str, Any]) -> None:
        """A request whose answer nobody waits for (watching a screen): failures are only logged."""
        try:
            await self.call(method, params, timeout=10)
        except Exception as exc:  # noqa: BLE001 - logged; the caller has moved on
            logger.info("%s on %s failed: %s", method, self.name, exc)

    async def event(self, name: str, data: Any) -> None:
        """Tells the node something it does not answer (the hub's build): failures are only logged."""
        try:
            await self._send(protocol.event(name, data))
        except Exception as exc:  # noqa: BLE001 - it may be gone already
            logger.info("telling %s %s failed: %s", self.name, name, exc)

    def answered(self, frame: dict[str, Any]) -> None:
        answer = self._pending.get(frame.get("id", -1))
        if answer is None or answer.done():
            return
        if "error" in frame:
            error = frame["error"] if isinstance(frame["error"], dict) else {}
            answer.set_exception(protocol.error_of(int(error.get("status", 502)), str(error.get("message", ""))))
        else:
            answer.set_result(frame.get("result"))

    def close(self, code: int = 1000) -> None:
        """On the event loop: fails what waits on it and hangs up (CLOSE_REVOKED: do not come back)."""
        if self.closed:
            return
        self.closed = True
        for answer in self._pending.values():
            if not answer.done():
                answer.set_exception(Unavailable(f"{self.name} disconnected"))
        asyncio.ensure_future(self._quietly(code))

    async def _quietly(self, code: int) -> None:
        try:
            await self._hangup(code)
        except Exception as exc:  # noqa: BLE001 - it may be gone already
            logger.debug("hanging up on %s: %s", self.name, exc)


def parse(raw: str) -> dict[str, Any] | None:
    try:
        frame = json.loads(raw)
    except ValueError:
        return None
    return frame if isinstance(frame, dict) else None
