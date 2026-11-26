"""Files an agent shares with the owner (`share_file`, an MCP tool only a session can call): copied when
shared into `<state>/shared/<session>/` on the session's own machine, kept KEPT_DAYS, and shown in that
session's conversation as a `shared` item (`ConversationItem.shared`). The bytes come from
GET /v1/sessions/{session_id}/shared/{file_id}; a node's session's from its node, pulled by the hub in chunks."""

from datetime import datetime

from pydantic import BaseModel, Field

KEPT_DAYS = 7
# The types served as themselves, shown inline: raster pictures, the videos browsers play, PDF. Anything
# else (SVG and HTML included: they can run script) is served as application/octet-stream, as a download.
INLINE_TYPES = frozenset(
    {
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "image/avif",
        "video/mp4",
        "video/webm",
        "application/pdf",
    }
)
DOWNLOAD_TYPE = "application/octet-stream"


def served_type(media_type: str) -> str:
    """The Content-Type a shared file is served with: its own for INLINE_TYPES, else a download."""
    base = media_type.split(";", 1)[0].strip().lower()
    return base if base in INLINE_TYPES else DOWNLOAD_TYPE


class SharedFile(BaseModel):
    """A file an agent shared. Past `expires_at` the file is gone (GET answers 404); the item stays."""

    id: str = Field(description="for GET /v1/sessions/{session_id}/shared/{file_id}")
    name: str = Field(description="its file name, as the agent's file was called (made safe)")
    size: int = Field(description="bytes")
    media_type: str = Field(description="its type as guessed from the name; served as such only when inline")
    caption: str | None = Field(default=None, description="what the agent said about it")
    shared_at: datetime
    expires_at: datetime


class ShareArgs(BaseModel):
    """`share_file`'s arguments."""

    path: str = Field(description="the file to share: absolute, or relative to the session's folder")
    caption: str | None = Field(default=None, description="one line for the owner about it")


SHARE_TOOL = "share_file"
SHARE_DESCRIPTION = (
    "Put a file (a screenshot, a clip, a PDF, a log) in front of the owner: it shows in your own conversation "
    "in muxtower, which they can open there. The file is copied now (a later change to it does not matter) and "
    "kept 7 days. Up to the daemon's attachments.max_mb (25 MB by default). Only a session can call it."
)
