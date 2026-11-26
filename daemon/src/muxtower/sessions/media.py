"""Serving an image or a video a conversation shows (`ConversationItem.media`): a file it names, or an image inside a
tool's result. What it is, its content says, never its name: PNG, JPEG, GIF, WebP and AVIF pictures, MP4 and WebM
videos, nothing else (no SVG, which could run script). A file is read only if it is a regular file (its links
followed: never a device, a pipe or a folder), at most MAX_BYTES, and only read."""

import base64
import binascii
import os
import stat
from dataclasses import dataclass
from pathlib import Path

from muxtower.errors import Gone, NotFound, NotMedia, TooLarge

MAX_BYTES = 25 * 1024 * 1024
HEAD_BYTES = 64
_MP4_BRANDS = {b"isom", b"iso2", b"iso4", b"iso5", b"iso6", b"mp41", b"mp42", b"avc1", b"M4V ", b"dash", b"mmp4"}


def sniff(head: bytes) -> str | None:
    """The media type of content starting with `head`, or None for anything but the pictures and videos taken."""
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    if head[4:8] == b"ftyp":
        brand = head[8:12]
        if brand in (b"avif", b"avis"):
            return "image/avif"
        if brand in _MP4_BRANDS:
            return "video/mp4"
        return None
    if head.startswith(b"\x1a\x45\xdf\xa3") and b"webm" in head[:HEAD_BYTES]:
        return "video/webm"
    return None


@dataclass(frozen=True)
class MediaInfo:
    size: int
    media_type: str


def where(written: str, home: Path, folder: str | None) -> Path:
    """The file a conversation's path names on the session's machine: ~/ from the home folder, a relative one from
    the session's folder."""
    if written.startswith("~/"):
        return home / written[2:]
    path = Path(written)
    if path.is_absolute():
        return path
    if not folder:
        raise NotFound(f"{written}: the session's folder is not known")
    return Path(folder).expanduser() / path


def _open(path: Path) -> tuple[int, os.stat_result]:
    """A file descriptor of the regular file `path` names (links followed), with its stat."""
    real = os.path.realpath(path)
    try:
        fd = os.open(real, os.O_RDONLY | os.O_NONBLOCK | getattr(os, "O_NOFOLLOW", 0))
    except FileNotFoundError:
        raise Gone("the file is no longer there") from None
    except OSError as exc:
        raise NotMedia(f"the file cannot be read ({type(exc).__name__})") from None
    info = os.fstat(fd)
    if not stat.S_ISREG(info.st_mode):
        os.close(fd)
        raise NotMedia("not a regular file")
    if info.st_size > MAX_BYTES:
        os.close(fd)
        raise TooLarge(f"larger than {MAX_BYTES // (1024 * 1024)} MB")
    return fd, info


def file_info(path: Path) -> MediaInfo:
    """What the file is: Gone when missing, NotMedia when not a picture or a video by its content."""
    fd, info = _open(path)
    try:
        media_type = sniff(os.pread(fd, HEAD_BYTES, 0))
    finally:
        os.close(fd)
    if media_type is None:
        raise NotMedia("not an image or a video")
    return MediaInfo(info.st_size, media_type)


def read_file(path: Path, offset: int, length: int) -> bytes:
    """Up to `length` bytes from `offset`, checked again as `file_info` does (it may have changed meanwhile)."""
    fd, _ = _open(path)
    try:
        if sniff(os.pread(fd, HEAD_BYTES, 0)) is None:
            raise NotMedia("not an image or a video")
        return os.pread(fd, max(0, min(length, MAX_BYTES)), max(0, offset))
    finally:
        os.close(fd)


def decoded(data: str) -> tuple[MediaInfo, bytes]:
    """An inline image's base64 as bytes, typed by its content (only pictures: an inline video is not taken)."""
    try:
        raw = base64.b64decode(data, validate=False)
    except (binascii.Error, ValueError):
        raise NotMedia("not an image") from None
    media_type = sniff(raw[:HEAD_BYTES])
    if media_type is None or not media_type.startswith("image/"):
        raise NotMedia("not an image")
    if len(raw) > MAX_BYTES:
        raise TooLarge(f"larger than {MAX_BYTES // (1024 * 1024)} MB")
    return MediaInfo(len(raw), media_type), raw
