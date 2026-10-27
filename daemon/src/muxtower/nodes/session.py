"""One open link from this node to its hub: what the node tells the hub, and the hub's requests."""

import asyncio
import logging
from collections.abc import Callable
from typing import Any

from websockets.asyncio.client import ClientConnection
from websockets.exceptions import ConnectionClosed

from muxtower.errors import Invalid, Unavailable
from muxtower.infra.bus import EventBus
from muxtower.nodes import protocol
from muxtower.nodes.api import NodeApi
from muxtower.nodes.link import parse
from muxtower.sessions.monitor import Monitor

logger = logging.getLogger("muxtower.hub")

RESEND_SECONDS = 60.0
DEBOUNCE_SECONDS = 0.3


class LinkSession:
    """One open link: what this node tells the hub, and the hub's requests."""

    def __init__(
        self, ws: ClientConnection, api: NodeApi, monitor: Monitor, bus: EventBus, hello: Callable[[], protocol.Hello]
    ) -> None:
        self.ws = ws
        self.api = api
        self.monitor = monitor
        self.bus = bus
        self.hello = hello
        self.queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        self.dirty = asyncio.Event()
        self.screens: dict[str, list[int]] = {}

    async def run(self) -> None:
        bus = self.bus
        hello = await asyncio.to_thread(self.hello)
        await self.ws.send(protocol.event("hello", hello.model_dump(mode="json")))
        bus.subscribe("sessions", self.queue)
        bus.subscribe("conversation:*", self.queue)
        self.dirty.set()
        tasks = [asyncio.create_task(t) for t in (self.read(), self.pump(), self.report())]
        try:
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()  # a closed link raises ConnectionClosed here
        finally:
            for task in tasks:
                task.cancel()
            bus.unsubscribe_all(self.queue)
            for session_id, histories in self.screens.items():
                for history in histories:
                    self.monitor.remove_viewer(session_id, history)

    async def report(self) -> None:
        """The sessions here, whole: soon after a change, and every minute regardless."""
        while True:
            try:
                await asyncio.wait_for(self.dirty.wait(), RESEND_SECONDS)
            except TimeoutError:
                pass
            self.dirty.clear()
            sessions = await asyncio.to_thread(self.api.sessions)
            await self.ws.send(protocol.event("sessions", sessions))
            await asyncio.sleep(DEBOUNCE_SECONDS)

    async def pump(self) -> None:
        while True:
            topic, payload = await self.queue.get()
            if topic == "sessions":
                self.dirty.set()
            elif topic.startswith("conversation:"):
                items = [i.model_dump(mode="json") for i in payload]
                await self.ws.send(
                    protocol.event("conversation", {"session_id": topic.split(":", 1)[1], "items": items})
                )
            elif topic.startswith("screen:"):
                await self.ws.send(protocol.event("screen", {"session_id": topic.split(":", 1)[1], "ansi": payload}))

    async def read(self) -> None:
        async for raw in self.ws:
            frame = parse(raw if isinstance(raw, str) else raw.decode())
            if frame is not None and isinstance(frame.get("method"), str) and "id" in frame:
                asyncio.create_task(self.answer(frame))

    async def answer(self, frame: dict[str, Any]) -> None:
        method, params = frame["method"], frame.get("params") or {}
        try:
            if method not in protocol.METHODS:
                raise Invalid(f"unknown method {method}")
            result: Any = None
            if method in ("watch_screen", "unwatch_screen"):
                self.watch(str(params.get("session_id")), int(params.get("history", 200)), method == "watch_screen")
            else:
                result = await asyncio.to_thread(self.api.handle, method, params)
            reply = protocol.answer(frame["id"], result)
        except Exception as exc:  # noqa: BLE001 - every failure goes back to the hub as its status
            if protocol.status_of(exc) == 502 and not isinstance(exc, Unavailable):
                logger.exception("the hub's %s failed here", method)
            reply = protocol.failure(frame["id"], exc)
        try:
            await self.ws.send(reply)
        except ConnectionClosed:
            pass

    def watch(self, session_id: str, history: int, watching: bool) -> None:
        histories = self.screens.setdefault(session_id, [])
        if watching:
            histories.append(history)
            self.monitor.add_viewer(session_id, history)
            self.bus.subscribe(f"screen:{session_id}", self.queue)
        elif history in histories:
            histories.remove(history)
            self.monitor.remove_viewer(session_id, history)
        if not histories:
            self.screens.pop(session_id, None)
            self.bus.unsubscribe(f"screen:{session_id}", self.queue)
