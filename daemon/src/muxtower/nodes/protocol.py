"""The link between a node and its hub: JSON text frames over one WebSocket the node opens.

Three kinds of frame, in both directions:
- a request  {"id": 7, "method": "approve", "params": {...}}
- its answer {"id": 7, "result": ...} or {"id": 7, "error": {"status": 409, "message": "..."}}
- an event   {"event": "sessions", "data": {...}}, which is not answered

The node speaks first (`hello`), then sends `sessions` (every one of its sessions, whole, whenever any
changes: idempotent, so a reconnect needs no catching up), `conversation` (new items, as its own stream
has them), `screen` (frames of the screens the hub watches) and `running` (which Remote Control
sessions have their Claude Code process there: `processes.py`); a peer ignores events it does not
know. The hub asks the node to act on its sessions with requests named like the daemon's own API
(`METHODS`), and tells it first which version it runs (`hub`: `update.py`). Errors travel as
HTTP statuses and come out on the other side as the same exception, so a 409 from a node is a 409
from the hub.

PROTOCOL is raised only by a change an older peer cannot read (a new event or field is not one). A side
may keep speaking older protocols, back to OLDEST: the link speaks the older of the two sides'
PROTOCOLs, and the hub refuses a node only when that is older than either side still speaks (`agree`).
So a release that raises PROTOCOL but keeps OLDEST asks no node to update; raising OLDEST does."""

import json
from typing import Any

from pydantic import BaseModel, Field

from muxtower.errors import Conflict, Forbidden, Invalid, NotFound, TooManyRequests, Unauthorized, Unavailable
from muxtower.runtimes.models import RuntimeInfo

PROTOCOL = 1  # the newest link this side speaks
OLDEST = 1  # the oldest it still speaks
MAX_FRAME_BYTES = 16 * 1024 * 1024
CLOSE_REVOKED = 4401  # the hub no longer knows this node: it should stop trying
CLOSE_INCOMPATIBLE = 4400

# What the hub may ask of a node.
METHODS = frozenset({
    "conversation", "screen", "watch_screen", "unwatch_screen", "input", "approve", "deny", "resize",
    "release_size", "update", "terminate", "archive", "mark_read", "detect_folder", "create", "image",
})  # fmt: skip

ERRORS: dict[int, type[Exception]] = {
    400: Invalid, 401: Unauthorized, 403: Forbidden, 404: NotFound, 409: Conflict, 429: TooManyRequests,
    502: Unavailable,
}  # fmt: skip


class Hello(BaseModel):
    protocol: int
    name: str = Field(description="the node's own name for itself (the hub names it as it was joined)")
    version: str
    runtimes: list[RuntimeInfo] = Field(default_factory=list)
    platform: str | None = Field(default=None, description="sys.platform there: darwin, linux, win32")
    oldest: int | None = Field(default=None, description="the oldest protocol it still speaks (else just `protocol`)")


def agree(protocol: int, oldest: int | None) -> int | None:
    """The protocol a link with a peer speaking `oldest`..`protocol` speaks, or None when there is none."""
    spoken = min(PROTOCOL, protocol)
    return spoken if spoken >= max(OLDEST, oldest or protocol) else None


def status_of(exc: Exception) -> int:
    return next((status for status, kind in ERRORS.items() if isinstance(exc, kind)), 502)


def error_of(status: int, message: str) -> Exception:
    return ERRORS.get(status, Unavailable)(message)


def request(request_id: int, method: str, params: dict[str, Any]) -> str:
    return json.dumps({"id": request_id, "method": method, "params": params})


def answer(request_id: int, result: Any) -> str:
    return json.dumps({"id": request_id, "result": result})


def failure(request_id: int, exc: Exception) -> str:
    return json.dumps(
        {"id": request_id, "error": {"status": status_of(exc), "message": str(exc) or type(exc).__name__}}
    )


def event(name: str, data: Any) -> str:
    return json.dumps({"event": name, "data": data})
