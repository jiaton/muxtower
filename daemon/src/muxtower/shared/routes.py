"""A file an agent shared (`SharedFile`), from the session's own machine: served as itself only for the
types a browser shows safely (`INLINE_TYPES`), else as a download; never sniffed, never run."""

from typing import Any

from fastapi import APIRouter, Response

from muxtower.auth.deps import CurrentDevice
from muxtower.errors import NotFound

router = APIRouter(prefix="/v1", tags=["shared"])

_INLINE: dict[str, dict[str, Any]] = {
    t: {} for t in ("image/*", "video/mp4", "video/webm", "application/pdf", "application/octet-stream")
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
def get_shared(session_id: str, file_id: str, _: CurrentDevice) -> Response:
    """A file the session's agent shared (`ConversationItem.shared`), from the machine it ran on. Served
    with its own Content-Type and `Content-Disposition: inline` for raster images (not SVG), MP4, WebM and
    PDF; anything else as `application/octet-stream`, `attachment`. Always `X-Content-Type-Options:
    nosniff` and `Content-Security-Policy: sandbox; default-src 'none'`. Takes a single `Range`."""
    raise NotFound("no such shared file")
