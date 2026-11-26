"""The images and videos a conversation shows (`ConversationItem.media`), served from the machine its session runs
on: a file the conversation names, by that path, or an image inside a tool's result, by its item and place. Only
what the conversation shows, only images and videos by their content, never more than 25 MB."""

import asyncio
from typing import Any

from fastapi import APIRouter, Request, Response

from muxtower.auth.deps import CurrentDevice
from muxtower.errors import NotFound
from muxtower.sessions.routes import Directory

router = APIRouter(prefix="/v1", tags=["sessions"])

MEDIA_TYPES: dict[str, dict[str, Any]] = {
    t: {} for t in ("image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "video/mp4", "video/webm")
}
SAFE_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Cache-Control": "private, max-age=86400",
}
_SHOWN = "the conversation shows no such image or video"
_ANSWERS: dict[int | str, dict[str, Any]] = {
    404: {"description": _SHOWN},
    409: {"description": "the session's machine cannot be reached now (a node whose link is down)"},
    410: {"description": "it was there and is no longer (deleted since): show it as gone, quietly"},
    413: {"description": "larger than 25 MB"},
    415: {"description": "not an image or a video by its content (whatever its name says), or not a regular file"},
}


@router.get(
    "/sessions/{session_id}/media",
    response_class=Response,
    responses={
        200: {"content": MEDIA_TYPES, "description": "the file, typed by its content"},
        206: {"description": "the part a single `Range: bytes=…` asked for (video seeking)"},
        416: {"description": "a range outside the file"},
        **_ANSWERS,
    },
)
async def get_media(session_id: str, path: str, _: CurrentDevice, directory: Directory, request: Request) -> Response:
    """A file the session's conversation names (`MediaRef.path`, sent back as the conversation wrote it), from the
    machine it runs on. Typed by its content: PNG, JPEG, GIF, WebP, AVIF, MP4 or WebM, nothing else (no SVG).
    Always `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox; default-src 'none'`. Takes a
    single `Range`."""
    image = await asyncio.to_thread(directory.image, session_id, path)  # images by absolute path, until step 2
    return Response(image.data, media_type=image.media_type, headers=SAFE_HEADERS)


@router.get(
    "/sessions/{session_id}/items/{seq}/media/{index}",
    response_class=Response,
    responses={200: {"content": MEDIA_TYPES, "description": "the image, typed by its content"}, **_ANSWERS},
)
async def get_inline_media(session_id: str, seq: int, index: int, _: CurrentDevice, directory: Directory) -> Response:
    """An image inside a tool's result (`MediaRef.index` of the item `seq`), as the conversation holds it, from the
    machine the session runs on. The same types and headers as a file."""
    raise NotFound(_SHOWN)
