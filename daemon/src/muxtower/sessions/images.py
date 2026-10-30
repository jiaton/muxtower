"""The images a conversation shows: files an agent looked at or sent the owner (Claude Code's Read and
SendUserFile, Codex's view_image), and absolute paths to image files in what the agent and the owner
wrote. A client shows them under the item; the daemon hands out only those (`SessionDirectory.image`),
so no other file of the machine can be read through it. A shell command's paths are not among them: a
command names files it works on, not pictures to look at."""

import re
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from muxtower.errors import Conflict, Invalid, NotFound

MEDIA_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
}  # fmt: skip
MAX_BYTES = 10 * 1024 * 1024  # a screenshot is far less; a node sends it base64 in one frame (16 MB)
IMAGE_TOOLS = frozenset({"Read", "SendUserFile", "view_image"})
# An absolute path ending in an image extension, set off from a name around it (Chinese text right
# before or after it, or punctuation, does). No spaces, quotes or brackets inside.
_PATH = re.compile(
    r"(?<![A-Za-z0-9_/.~-])(/[^\s\"'`()<>\[\]{}|,;*?]+?\.(?:png|jpe?g|gif|webp))(?![A-Za-z0-9_.-])", re.IGNORECASE
)


def shown_images(kind: str, tool_name: str | None, text: str | None) -> list[str]:
    """The image paths an item shows, in the order it names them, each once."""
    if not text or (kind == "tool" and tool_name not in IMAGE_TOOLS) or kind not in ("tool", "prompt", "reply"):
        return []
    return list(dict.fromkeys(_PATH.findall(text)))


@dataclass(frozen=True)
class ImageFile:
    media_type: str
    data: bytes


def read_image(path: str) -> ImageFile:
    file = Path(path)
    media_type = MEDIA_TYPES.get(file.suffix.lower())
    if media_type is None or not file.is_absolute():
        raise Invalid("not an image file's path")
    try:
        if not file.is_file():
            raise NotFound("no such image")
        if file.stat().st_size > MAX_BYTES:
            raise Conflict(f"the image is larger than {MAX_BYTES // (1024 * 1024)} MB")
        return ImageFile(media_type, file.read_bytes())
    except OSError as exc:
        raise NotFound("the image cannot be read") from exc


class Shows(Protocol):
    images: list[str]


def read_shown(path: str, items: Iterable[Shows], here: bool) -> ImageFile:
    """`path`, if one of the conversation's items shows it and its agent runs on this machine (`here`)."""
    if not any(path in item.images for item in items):
        raise NotFound("the conversation shows no such image")
    if not here:
        raise Conflict("the image is on the machine the session runs on, which is not this one")
    return read_image(path)
