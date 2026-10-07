"""/v1/stream: one WebSocket per client. The client subscribes to topics; the server pushes frames.

Auth, in order: the stream cookie (same-origin app only), `Sec-WebSocket-Protocol: muxtower,
bearer.<token>`, then `?token=` for proxies that only forward query tokens."""

import asyncio
import contextlib
import logging
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Request, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, ValidationError

from muxtower.auth.deps import WS_BEARER_PREFIX, WS_SUBPROTOCOL, CurrentDevice
from muxtower.auth.stream_cookie import COOKIE_NAME, COOKIE_PATH, MAX_AGE_SECONDS
from muxtower.errors import NotFound
from muxtower.infra.tmux import TmuxError
from muxtower.sessions.models import Session

logger = logging.getLogger("muxtower.stream")
router = APIRouter(prefix="/v1", tags=["stream"])


class StreamSubscribe(BaseModel):
    type: Literal["subscribe", "unsubscribe"]
    topic: Literal["sessions", "screen"]
    session_id: str | None = None
    history: int = Field(default=200, ge=0, le=5000)


class SessionsFrame(BaseModel):
    type: Literal["sessions"] = "sessions"
    sessions: list[Session]


class ScreenFrame(BaseModel):
    type: Literal["screen"] = "screen"
    session_id: str
    ansi: str


class ErrorFrame(BaseModel):
    type: Literal["error"] = "error"
    message: str


ServerFrame = Annotated[SessionsFrame | ScreenFrame | ErrorFrame, Field(discriminator="type")]


class StreamSchema(BaseModel):
    """Documents the WebSocket message shapes so they reach the generated client types."""

    client: StreamSubscribe
    server: ServerFrame


@router.get("/stream/schema")
def stream_schema() -> StreamSchema:
    return StreamSchema(client=StreamSubscribe(type="subscribe", topic="sessions"), server=ErrorFrame(message=""))


@router.post("/stream/cookie", status_code=204)
def stream_cookie(request: Request, device: CurrentDevice) -> Response:
    """Sets an HttpOnly cookie that authenticates /v1/stream for a same-origin page."""
    value = request.app.state.stream_cookies.issue(device.name)
    secure = request.url.scheme == "https" or (request.app.state.settings.public_url or "").startswith("https")
    response = Response(status_code=204)
    response.set_cookie(
        COOKIE_NAME, value, max_age=MAX_AGE_SECONDS, path=COOKIE_PATH, httponly=True, secure=secure,
        samesite="strict",
    )  # fmt: skip
    return response


def _authenticate(ws: WebSocket) -> tuple[str | None, bool]:
    """(device name or None, whether the client offered the muxtower subprotocol)."""
    state = ws.app.state
    offered = [p.strip() for p in ws.headers.get("sec-websocket-protocol", "").split(",") if p.strip()]
    origin, host = ws.headers.get("origin"), ws.headers.get("host")

    cookie = ws.cookies.get(COOKIE_NAME)
    if cookie and state.origins.same_origin(origin, host):
        name = state.stream_cookies.verify(cookie)
        if name is not None and (name in state.tokens.extra or any(t.name == name for t in state.tokens.list())):
            return name, WS_SUBPROTOCOL in offered

    token = next((p.removeprefix(WS_BEARER_PREFIX) for p in offered if p.startswith(WS_BEARER_PREFIX)), None)
    token = token or ws.query_params.get("token", "")
    device = state.tokens.verify(token)
    return (device.name if device else None), WS_SUBPROTOCOL in offered


class _Connection:
    def __init__(self, ws: WebSocket) -> None:
        self.ws = ws
        self.app = ws.app
        self.queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        self.screens: dict[str, int] = {}  # session id -> history

    async def send(self, frame: BaseModel) -> None:
        await self.ws.send_text(frame.model_dump_json())

    async def send_sessions(self) -> None:
        sessions = await asyncio.to_thread(self.app.state.sessions.list)
        await self.send(SessionsFrame(sessions=sessions))

    async def handle(self, message: StreamSubscribe) -> None:
        bus, monitor = self.app.state.bus, self.app.state.monitor
        if message.topic == "sessions":
            if message.type == "subscribe":
                bus.subscribe("sessions", self.queue)
                await self.send_sessions()
            else:
                bus.unsubscribe("sessions", self.queue)
            return
        session_id = message.session_id or ""
        if message.type == "unsubscribe":
            if session_id in self.screens:
                bus.unsubscribe(f"screen:{session_id}", self.queue)
                monitor.remove_viewer(session_id, self.screens.pop(session_id))
            return
        try:
            screen = await asyncio.to_thread(self.app.state.terminal.screen, session_id, message.history)
        except (NotFound, TmuxError) as exc:  # unknown session, pane gone, tmux failure
            await self.send(ErrorFrame(message=str(exc) or "cannot open screen"))
            return
        if session_id in self.screens:
            monitor.remove_viewer(session_id, self.screens[session_id])
        self.screens[session_id] = message.history
        monitor.add_viewer(session_id, message.history)
        bus.subscribe(f"screen:{session_id}", self.queue)
        await self.send(ScreenFrame(session_id=session_id, ansi=screen.ansi or screen.text))

    async def reader(self) -> None:
        while True:
            raw = await self.ws.receive_text()
            try:
                await self.handle(StreamSubscribe.model_validate_json(raw))
            except ValidationError as exc:
                await self.send(ErrorFrame(message=f"bad message: {exc.errors()[0]['msg']}"))

    async def writer(self) -> None:
        while True:
            topic, payload = await self.queue.get()
            if topic == "sessions":
                await self.send_sessions()
            elif topic.startswith("screen:"):
                await self.send(ScreenFrame(session_id=topic.split(":", 1)[1], ansi=payload))

    def close(self) -> None:
        self.app.state.bus.unsubscribe_all(self.queue)
        for session_id, history in self.screens.items():
            self.app.state.monitor.remove_viewer(session_id, history)


@router.websocket("/stream")
async def stream(ws: WebSocket) -> None:
    device, wants_subprotocol = _authenticate(ws)
    if not ws.app.state.origins.websocket_allowed(ws.headers.get("origin"), ws.headers.get("host")):
        await ws.close(code=4403)
        return
    if device is None:
        await ws.close(code=4401)
        return
    await ws.accept(subprotocol=WS_SUBPROTOCOL if wants_subprotocol else None)
    conn = _Connection(ws)
    tasks = [asyncio.create_task(conn.reader()), asyncio.create_task(conn.writer())]
    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            exc = task.exception()
            if exc and not isinstance(exc, WebSocketDisconnect | RuntimeError):
                logger.error("stream for %s failed", device, exc_info=exc)
    finally:
        for task in tasks:
            task.cancel()
        with contextlib.suppress(Exception):
            await asyncio.gather(*tasks, return_exceptions=True)
        conn.close()
