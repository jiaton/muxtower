"""An image or a video a node's session shows (`sessions/media_reading.py`): read on that node, by the hub over the
link in pieces of the link's `media` method (`step`: stat, read with offset and length), so no frame is large (the
link's pings must keep getting through) and neither side holds a video whole."""

import base64
from typing import TYPE_CHECKING, Any

from muxtower.errors import Invalid, NotFound
from muxtower.nodes.shared import READ_BYTES
from muxtower.sessions.media import MediaInfo
from muxtower.sessions.media_reading import MediaAsk, MediaReading

if TYPE_CHECKING:
    from muxtower.nodes.source import NodeSource


def media_step(directory: MediaReading, session_id: str, params: dict[str, Any]) -> Any:
    """Node side: one step the hub asks for."""
    ask = MediaAsk.of(params)
    match params.get("step"):
        case "stat":
            info = directory.media_info(session_id, ask)
            return {"size": info.size, "media_type": info.media_type}
        case "read":
            offset, length = int(params.get("offset") or 0), min(int(params.get("length") or 0), READ_BYTES)
            return {"data": base64.b64encode(directory.read_media(session_id, ask, offset, length)).decode()}
    raise Invalid(f"unknown media step {params.get('step')!r}")


def node_stat(nodes: "NodeSource", session_id: str, ask: MediaAsk) -> MediaInfo:
    """Hub side: what the node's session shows there."""
    try:
        found = nodes.media_step(session_id, {"step": "stat", **ask.params()})
    except Invalid as exc:  # a node older than this: "unknown method", so it serves none
        raise NotFound("the node cannot serve this image or video: update it") from exc
    return MediaInfo(int(found["size"]), str(found["media_type"]))


def node_read(nodes: "NodeSource", session_id: str, ask: MediaAsk, offset: int, length: int) -> bytes:
    """Hub side: up to `length` bytes from `offset`, asked for in pieces of at most READ_BYTES."""
    params = {"step": "read", **ask.params(), "offset": offset, "length": min(length, READ_BYTES)}
    return base64.b64decode(nodes.media_step(session_id, params)["data"])
