import re
from typing import Literal

from pydantic import BaseModel, Field, model_validator

# tmux key names a client may send: optional C-/M-/S- modifiers + a single char or a named key.
KEY_RE = re.compile(
    r"^(?:[CMS]-)*(?:[A-Za-z0-9]|Enter|Escape|Tab|BTab|Space|BSpace|DC|IC|Up|Down|Left|Right|Home|End"
    r"|PageUp|PageDown|PPage|NPage|F[1-9]|F1[0-2])$"
)


class Screen(BaseModel):
    session_id: str
    text: str = Field(description="current screen, plain text")
    ansi: str | None = Field(description="screen with colors and scrollback, when requested")


MAX_IMAGES = 4
MAX_IMAGE_BASE64 = 7_000_000  # ~5 MB of image; the app sends them scaled down, a few hundred KB each


class ImageInput(BaseModel):
    media_type: Literal["image/png", "image/jpeg", "image/gif", "image/webp"]
    data: str = Field(max_length=MAX_IMAGE_BASE64, description="the image, base64")


class SendInput(BaseModel):
    """Either literal `text` (optionally followed by Enter) or one tmux `key` name. A message (`text`) may
    carry `images` where the session takes them (`capabilities.images`)."""

    text: str | None = Field(default=None, max_length=20000)
    key: str | None = None
    enter: bool = False
    images: list[ImageInput] = Field(default_factory=list, max_length=MAX_IMAGES)

    @model_validator(mode="after")
    def _one_of(self) -> "SendInput":
        if (self.text is None) == (self.key is None):
            raise ValueError("send exactly one of text or key")
        if self.images and self.text is None:
            raise ValueError("images go with a message (text)")
        if self.key is not None and not KEY_RE.match(self.key):
            raise ValueError(f"unsupported key {self.key!r}")
        return self


class Resize(BaseModel):
    cols: int = Field(ge=20, le=500)
    rows: int = Field(ge=5, le=300)
