"""Uploading a file for a message: to the session's machine (a node's session: that node's own state), where
the agent can read it. The body is written as it arrives, never held whole (`store.py`, `nodes/attachments.py`)."""

import asyncio
from typing import Annotated
from urllib.parse import unquote

from fastapi import APIRouter, Header, Request

from muxtower.attachments.models import FILENAME_HEADER, Attachment
from muxtower.auth.deps import CurrentDevice
from muxtower.auth.routes import Audit
from muxtower.errors import TooLarge
from muxtower.sessions.routes import Directory

router = APIRouter(prefix="/v1", tags=["attachments"])

WRITE_BYTES = 1024 * 1024  # what arrives is written in pieces of about this much


@router.post(
    "/sessions/{session_id}/attachments",
    status_code=201,
    responses={
        409: {"description": "this session takes no files (Remote Control only: pictures only)"},
        413: {"description": "larger than attachments.max_mb"},
    },
    openapi_extra={"requestBody": {"required": True, "content": {"application/octet-stream": {"schema": {}}}}},
)
async def upload_attachment(
    session_id: str,
    request: Request,
    device: CurrentDevice,
    directory: Directory,
    audit: Audit,
    filename: Annotated[str, Header(alias=FILENAME_HEADER)],
) -> Attachment:
    """A file for a message, its bytes as the body and its name in the header (any type; the Content-Type
    header its type): saved on the session's machine, 0600, kept 7 days. Named in the message by its id."""
    name = unquote(filename, errors="replace")
    media_type = request.headers.get("content-type", "")
    upload = await asyncio.to_thread(directory.upload, session_id, name, media_type)
    try:
        declared = request.headers.get("content-length", "")
        if declared.isdigit() and int(declared) > upload.max_bytes:
            raise TooLarge(f"larger than {upload.max_bytes // (1024 * 1024)} MB")
        pending = bytearray()
        async for chunk in request.stream():
            pending += chunk
            if len(pending) >= WRITE_BYTES:
                data, pending = bytes(pending), bytearray()
                await asyncio.to_thread(upload.write, data)
        if pending:
            await asyncio.to_thread(upload.write, bytes(pending))
        attachment = await asyncio.to_thread(upload.finish)
    except BaseException:
        await asyncio.to_thread(upload.abort)
        raise
    audit.record(device.name, "attachment", session_id, f"name={attachment.name} size={attachment.size}")
    return attachment
