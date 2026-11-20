"""Files attached to a message (any type; pictures keep their own path, `terminal/images.py`): uploaded one by
one to the session's machine before the message is sent, then named in it by id (`SendInput.attachments`),
each pasted into the agent's prompt as its path followed by a space (shell-quoted where it needs it), as pictures are;
never a newline, which a pane without bracketed paste would take for Enter."""

from pydantic import BaseModel, Field

FILENAME_HEADER = "X-Muxtower-Filename"
DEFAULT_MAX_MB = 25  # each; `attachments.max_mb`
KEPT_DAYS = 7


class Attachment(BaseModel):
    id: str = Field(description="what a message names it by (`SendInput.attachments`)")
    name: str = Field(description="its file name as saved: the original, made safe and unique")
    size: int = Field(description="bytes")
    media_type: str
    path: str = Field(description="where it lies on the session's machine: what the agent is given")
