"""A file a node's session shared: kept on that node (`shared/store.py`), read by the hub over the link in
pieces of the link's `shared` method (`step`: stat, read with offset and length), so no frame is large (the
link's pings must keep getting through) and neither side holds the whole file."""

import base64
from typing import TYPE_CHECKING, Any

from muxtower.errors import Invalid, NotFound
from muxtower.shared.models import SharedFile

if TYPE_CHECKING:
    from muxtower.nodes.source import NodeSource
    from muxtower.shared.directory import Sharing

# Raw bytes per `read`: about 930 KB as base64, so every frame stays under 1 MB.
READ_BYTES = 700 * 1024


def shared_step(directory: "Sharing", session_id: str, params: dict[str, Any]) -> Any:
    """Node side: one step the hub asks for."""
    file_id = str(params.get("file") or "")
    match params.get("step"):
        case "stat":
            return directory.shared_file(session_id, file_id).model_dump(mode="json")
        case "read":
            offset, length = int(params.get("offset") or 0), min(int(params.get("length") or 0), READ_BYTES)
            data = directory.read_shared(session_id, file_id, offset, length)
            return {"data": base64.b64encode(data).decode()}
    raise Invalid(f"unknown shared step {params.get('step')!r}")


def node_stat(nodes: "NodeSource", session_id: str, file_id: str) -> SharedFile:
    """Hub side: what the node has under this id."""
    try:
        found = nodes.shared_step(session_id, {"step": "stat", "file": file_id})
    except Invalid as exc:  # a node older than shared files: "unknown method", so nothing shared there
        raise NotFound("no such shared file") from exc
    return SharedFile.model_validate(found)


def node_read(nodes: "NodeSource", session_id: str, file_id: str, offset: int, length: int) -> bytes:
    """Hub side: up to `length` bytes from `offset`, asked for in pieces of at most READ_BYTES."""
    params = {"step": "read", "file": file_id, "offset": offset, "length": min(length, READ_BYTES)}
    return base64.b64decode(nodes.shared_step(session_id, params)["data"])
