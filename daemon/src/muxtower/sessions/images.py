"""The images and videos a conversation shows: files an agent looked at or sent the owner (Claude Code's Read and
SendUserFile, Codex's view_image), and paths to image and video files in what the agent and the owner wrote
(`sessions/media.py` serves them). A client shows them under the item; the daemon hands out only those
(`SessionDirectory.image`, `.media_info`), so no other file of the machine can be read through it. Another tool's
input is not among them (a shell command's paths, a file written): it names files it works on, not pictures to
look at."""

import re
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from muxtower.errors import Conflict, Invalid, NotFound

MEDIA_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
}  # fmt: skip
VIDEO_SUFFIXES = (".mp4", ".webm")
MAX_BYTES = 10 * 1024 * 1024  # a screenshot is far less; a node sends it base64 in one frame (16 MB)
IMAGE_TOOLS = frozenset({"Read", "SendUserFile", "view_image"})
_EXT = r"(?:png|jpe?g|gif|webp|avif|mp4|webm)"
# A path ending in an image or video extension: absolute, from the home folder (~/), or relative with a folder in
# it (./a.png, out/a.png), set off from a name around it (Chinese text right before or after it, or punctuation,
# does). No spaces, quotes, brackets or colons inside, so a URL is never one.
_PATH = re.compile(
    rf"(?<![A-Za-z0-9_/.~:@%-])((?:~/|\.{{1,2}}/|/)?[A-Za-z0-9_.~/][^\s\"'`()<>\[\]{{}}|,;*?:]*?\.{_EXT})"
    r"(?![A-Za-z0-9_.-])",
    re.IGNORECASE,
)
# Markdown's image: ![alt](path) or ![alt](<path>), where a bare name is a path too.
_MARKDOWN = re.compile(rf"!\[[^\]\n]*\]\(\s*<?([^)\s<>]+\.{_EXT})>?(?:\s+\"[^\"]*\")?\s*\)", re.IGNORECASE)


def shown_media(kind: str, tool_name: str | None, text: str | None) -> list[str]:
    """The image and video paths an item shows, as written, in the order it names them, each once: from what the
    owner and the agent wrote, and the files an image tool looked at or sent. Never another tool's input."""
    if not text or (kind == "tool" and tool_name not in IMAGE_TOOLS) or kind not in ("tool", "prompt", "reply"):
        return []
    found = [(m.start(1), m.group(1)) for m in _MARKDOWN.finditer(text) if ":" not in m.group(1)]
    found += [
        (m.start(1), m.group(1))
        for m in _PATH.finditer(text)
        if m.group(1).startswith(("/", "~/")) or "/" in m.group(1)
    ]
    return list(dict.fromkeys(path for _, path in sorted(found)))


def is_video(path: str) -> bool:
    return path.lower().endswith(VIDEO_SUFFIXES)


def shown_images(kind: str, tool_name: str | None, text: str | None) -> list[str]:
    """The absolute image paths an item shows (older apps: `ConversationItem.images`)."""
    return [
        p for p in shown_media(kind, tool_name, text) if p.startswith("/") and p.lower().endswith(tuple(MEDIA_TYPES))
    ]


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
