"""A file an agent shared (`SharedFile`), from the session's own machine: served as itself only for the
types a browser shows safely (`INLINE_TYPES`), else as a download; never sniffed, never run. Streamed in
pieces (a node's file: pulled over the link a piece at a time), never held whole."""

import asyncio
import re
from collections.abc import AsyncIterator
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Request, Response
from fastapi.responses import StreamingResponse

from muxtower.auth.deps import CurrentDevice
from muxtower.sessions.routes import Directory
from muxtower.shared.models import DOWNLOAD_TYPE, SharedFile, served_type

router = APIRouter(prefix="/v1", tags=["shared"])

PIECE_BYTES = 512 * 1024  # what is read (or pulled from a node) at a time
SINGLE_RANGE = re.compile(r"^bytes=(\d*)-(\d*)$")

_INLINE: dict[str, dict[str, Any]] = {
    t: {} for t in ("image/*", "video/mp4", "video/webm", "application/pdf", "application/octet-stream")
}


def wanted_range(header: str | None, size: int) -> tuple[int, int] | None:
    """The bytes [start, end] one `Range: bytes=…` asks for, clipped to the file; None for no range, or one
    this does not take (several ranges: the whole file is sent). ValueError: outside the file (416)."""
    found = SINGLE_RANGE.match((header or "").strip())
    if found is None:
        return None
    first, last = found.groups()
    if not first and not last:
        return None
    if not first:  # the last N bytes
        start, end = max(size - int(last), 0), size - 1
    else:
        start = int(first)
        end = min(int(last), size - 1) if last else size - 1
    if start >= size or end < start:
        raise ValueError("outside the file")
    return start, end


def _headers(shared: SharedFile) -> dict[str, str]:
    served = served_type(shared.media_type)
    disposition = "attachment" if served == DOWNLOAD_TYPE else "inline"
    return {
        "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(shared.name, safe='')}",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=86400",
    }


@router.get(
    "/sessions/{session_id}/shared/{file_id}",
    response_class=Response,
    responses={
        200: {"content": _INLINE, "description": "the file"},
        206: {"description": "the part a `Range: bytes=…` header asked for (video seeking)"},
        404: {"description": "no such file in this session's conversation, or it expired (kept 7 days)"},
        409: {"description": "the session's machine cannot be reached now (a node whose link is down)"},
        416: {"description": "a range outside the file"},
    },
)
async def get_shared(
    session_id: str,
    file_id: str,
    _: CurrentDevice,
    directory: Directory,
    request: Request,
) -> Response:
    """A file the session's agent shared (`ConversationItem.shared`), from the machine it ran on. Served
    with its own Content-Type and `Content-Disposition: inline` for raster images (not SVG), MP4, WebM and
    PDF; anything else as `application/octet-stream`, `attachment`. Always `X-Content-Type-Options:
    nosniff` and `Content-Security-Policy: sandbox; default-src 'none'`. Takes a single `Range`."""
    shared = await asyncio.to_thread(directory.shared_file, session_id, file_id)
    headers = _headers(shared)
    try:
        asked = wanted_range(request.headers.get("range"), shared.size)
    except ValueError:
        return Response(status_code=416, headers={**headers, "Content-Range": f"bytes */{shared.size}"})
    start, end = asked if asked is not None else (0, shared.size - 1)
    if asked is not None:
        headers["Content-Range"] = f"bytes {start}-{end}/{shared.size}"
    headers["Content-Length"] = str(max(end - start + 1, 0))

    async def pieces() -> AsyncIterator[bytes]:
        offset = start
        while offset <= end:
            length = min(PIECE_BYTES, end - offset + 1)
            data = await asyncio.to_thread(directory.read_shared, session_id, file_id, offset, length)
            if not data:  # it got shorter (expired and pruned while being sent)
                return
            yield data
            offset += len(data)

    status = 206 if asked is not None else 200
    return StreamingResponse(pieces(), status_code=status, media_type=served_type(shared.media_type), headers=headers)
