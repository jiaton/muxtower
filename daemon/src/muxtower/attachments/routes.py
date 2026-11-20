"""Uploading a file for a message: to the session's machine (a node's session: that node's own state), where
the agent can read it. The contract; the saving is the next task (attachments v1)."""

from typing import Annotated

from fastapi import APIRouter, Header, Request

from muxtower.attachments.models import FILENAME_HEADER, Attachment
from muxtower.auth.deps import CurrentDevice
from muxtower.errors import Conflict

router = APIRouter(prefix="/v1", tags=["attachments"])


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
    _: CurrentDevice,
    filename: Annotated[str, Header(alias=FILENAME_HEADER)],
) -> Attachment:
    """A file for a message, its bytes as the body and its name in the header (any type; the Content-Type
    header its type): saved on the session's machine, 0600, kept 7 days. Named in the message by its id."""
    raise Conflict("attachments are not built yet")
