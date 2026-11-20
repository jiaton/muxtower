"""Files attached to messages, kept as pictures are (`terminal/images.py`): under the state directory, one
folder per session (0700), each file 0600, named `<id>-<its name made safe>`. Written to a hidden
`.<id>.part` while it arrives, so a file is found by its id only once whole. Kept `KEPT_DAYS`."""

import asyncio
import logging
import os
import re
import secrets
import threading
import time
import unicodedata
from collections.abc import Callable
from pathlib import Path

from muxtower.attachments.models import KEPT_DAYS, Attachment
from muxtower.errors import Conflict, TooLarge

logger = logging.getLogger("muxtower.attachments")

MAX_NAME_BYTES = 120
MAX_EXTENSION_BYTES = 16
MAX_MEDIA_TYPE = 127  # RFC 6838
ID = re.compile(r"^[0-9a-f]{8}$")
PRUNE_SECONDS = 3600


def safe_name(name: str) -> str:
    """Its last path part, without control characters or leading dots, at most `MAX_NAME_BYTES` of UTF-8,
    its extension kept; `file` when nothing is left."""
    name = re.split(r"[/\\]", name)[-1]
    name = "".join(c for c in name if unicodedata.category(c) not in ("Cc", "Cf", "Zl", "Zp"))
    name = name.strip().lstrip(".").strip() or "file"
    stem, ext = os.path.splitext(name)
    if len(ext.encode()) > MAX_EXTENSION_BYTES:
        stem, ext = name, ""
    room = MAX_NAME_BYTES - len(ext.encode())
    stem = stem.encode()[:room].decode(errors="ignore").rstrip() or "file"
    return stem + ext


def _folder_name(session_id: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "_", session_id) or "_"


class LocalUpload:
    def __init__(self, store: "AttachmentStore", session_id: str, name: str, media_type: str) -> None:
        self.max_bytes = store.max_bytes()
        self.folder = store.folder(session_id)
        self.id = secrets.token_hex(4)
        self.name = f"{self.id}-{safe_name(name)}"
        self.media_type = media_type.strip()[:MAX_MEDIA_TYPE] or "application/octet-stream"
        self.part = self.folder / f".{self.id}.part"
        self.size = 0
        os.close(os.open(self.part, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600))

    def write(self, data: bytes) -> None:
        if self.size + len(data) > self.max_bytes:
            self.abort()
            raise TooLarge(f"larger than {self.max_bytes // (1024 * 1024)} MB")
        with self.part.open("ab") as out:
            out.write(data)
        self.size += len(data)

    def finish(self) -> Attachment:
        path = self.folder / self.name
        self.part.rename(path)
        return Attachment(id=self.id, name=self.name, size=self.size, media_type=self.media_type, path=str(path))

    def abort(self) -> None:
        self.part.unlink(missing_ok=True)


class AttachmentStore:
    def __init__(self, directory: Path, max_bytes: Callable[[], int]) -> None:
        self.directory = directory
        self.max_bytes = max_bytes  # read at each upload: the setting applies at once
        self._lock = threading.Lock()  # a folder found empty is not removed under a new upload

    def folder(self, session_id: str) -> Path:
        folder = self.directory / _folder_name(session_id)
        for made in (self.directory, folder):
            made.mkdir(mode=0o700, exist_ok=True)
            made.chmod(0o700)
        return folder

    def begin(self, session_id: str, name: str, media_type: str) -> LocalUpload:
        self.prune()
        with self._lock:
            return LocalUpload(self, session_id, name, media_type)

    def paths(self, session_id: str, ids: list[str]) -> list[Path]:
        """Each file by its id, uploaded for this session; Conflict for one it does not have."""
        folder = self.directory / _folder_name(session_id)
        found = []
        for wanted in ids:
            match = None
            if ID.match(wanted) and folder.is_dir():
                match = next((p for p in folder.iterdir() if p.name.startswith(f"{wanted}-") and p.is_file()), None)
            if match is None:
                raise Conflict(f"no file {wanted[:16]!r} uploaded for this session (or gone after {KEPT_DAYS} days)")
            found.append(match)
        return found

    def prune(self) -> None:
        """Files older than `KEPT_DAYS` (and uploads left unfinished as long) go, then folders left empty."""
        if not self.directory.is_dir():
            return
        old = time.time() - KEPT_DAYS * 86_400
        for folder in self.directory.iterdir():
            if not folder.is_dir():
                continue
            for path in folder.iterdir():
                if path.is_file() and path.stat().st_mtime < old:
                    path.unlink(missing_ok=True)
            with self._lock:
                if not any(folder.iterdir()):
                    folder.rmdir()

    async def run_loop(self) -> None:
        """Prunes every hour, for as long as the daemon runs (uploads prune too)."""
        while True:
            try:
                await asyncio.to_thread(self.prune)
            except OSError:
                logger.warning("old attachments could not be pruned", exc_info=True)
            await asyncio.sleep(PRUNE_SECONDS)
