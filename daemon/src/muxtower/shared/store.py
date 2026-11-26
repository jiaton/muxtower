"""Files agents shared, kept as attachments are (`attachments/store.py`): under the state directory, one folder
per session (0700), each file 0600, named `<id>-<its name made safe>`, copied to a hidden `.<id>.part` first
so a file is found by its id only once whole. Kept `KEPT_DAYS` from when it was shared (its mtime)."""

import asyncio
import logging
import mimetypes
import os
import re
import secrets
import stat
import threading
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path

from muxtower.attachments.store import _folder_name, private_folder, prune_kept, safe_name
from muxtower.errors import Invalid, NotFound, TooLarge
from muxtower.shared.models import DOWNLOAD_TYPE, KEPT_DAYS, SharedFile

logger = logging.getLogger("muxtower.shared")

ID = re.compile(r"^[0-9a-f]{16}$")
COPY_BYTES = 1024 * 1024  # copied in pieces of this much: a file is never read whole
PRUNE_SECONDS = 3600


def media_type_of(name: str) -> str:
    return mimetypes.guess_type(name, strict=False)[0] or DOWNLOAD_TYPE


class SharedStore:
    def __init__(self, directory: Path, max_bytes: Callable[[], int]) -> None:
        self.directory = directory
        self.max_bytes = max_bytes  # `attachments.max_mb`, read at each share
        self._lock = threading.Lock()  # a folder found empty is not removed under a new file

    def share(self, session_id: str, source: Path, caption: str | None) -> SharedFile:
        """Copies `source` (absolute) for the owner. Invalid for what is not a regular file this daemon can read,
        TooLarge past `max_bytes`: both say why, for the agent."""
        self.prune()
        limit = self.max_bytes()
        try:
            # Non-blocking, so a FIFO is refused below instead of hanging here; a symlink is followed.
            fd = os.open(source, os.O_RDONLY | os.O_NONBLOCK)
        except FileNotFoundError as exc:
            raise Invalid(f"no such file: {source}") from exc
        except OSError as exc:
            raise Invalid(f"cannot read {source}: {exc.strerror or exc}") from exc
        try:
            found = os.fstat(fd)
            if not stat.S_ISREG(found.st_mode):
                raise Invalid(f"not a regular file: {source}")
            if found.st_size > limit:
                raise TooLarge(f"{source} is larger than {limit // (1024 * 1024)} MB (attachments.max_mb)")
            os.set_blocking(fd, True)
        except BaseException:
            os.close(fd)
            raise
        with os.fdopen(fd, "rb") as original:
            file_id = secrets.token_hex(8)
            name = safe_name(source.name)
            with self._lock:
                folder = private_folder(self.directory, session_id)
                part = folder / f".{file_id}.part"
                out_fd = os.open(part, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            try:
                size = 0
                with os.fdopen(out_fd, "wb") as out:
                    while chunk := original.read(COPY_BYTES):
                        size += len(chunk)
                        if size > limit:  # it grew while being copied
                            raise TooLarge(f"{source} is larger than {limit // (1024 * 1024)} MB (attachments.max_mb)")
                        out.write(chunk)
                path = folder / f"{file_id}-{name}"
                part.rename(path)
            except OSError as exc:
                part.unlink(missing_ok=True)
                raise Invalid(f"cannot read {source}: {exc.strerror or exc}") from exc
            except BaseException:
                part.unlink(missing_ok=True)
                raise
        return self._described(path, file_id).model_copy(update={"caption": caption or None})

    def find(self, session_id: str, file_id: str) -> SharedFile:
        """The file by its id, shared in this session; NotFound for one it does not have, or past KEPT_DAYS."""
        return self._described(self._path(session_id, file_id), file_id)

    def read(self, session_id: str, file_id: str, offset: int, length: int) -> bytes:
        """Up to `length` bytes from `offset` (fewer at its end)."""
        with self._path(session_id, file_id).open("rb") as f:
            f.seek(max(offset, 0))
            return f.read(max(length, 0))

    def _path(self, session_id: str, file_id: str) -> Path:
        folder = self.directory / _folder_name(session_id)
        if ID.match(file_id) and folder.is_dir():
            for path in folder.iterdir():
                if path.name.startswith(f"{file_id}-") and path.is_file():
                    if path.stat().st_mtime >= time.time() - KEPT_DAYS * 86_400:
                        return path
                    break
        raise NotFound(f"no shared file {file_id[:16]!r} in this session (or gone after {KEPT_DAYS} days)")

    @staticmethod
    def _described(path: Path, file_id: str) -> SharedFile:
        found = path.stat()
        name = path.name[len(file_id) + 1 :]
        shared_at = datetime.fromtimestamp(found.st_mtime, UTC)
        return SharedFile(
            id=file_id, name=name, size=found.st_size, media_type=media_type_of(name),
            shared_at=shared_at, expires_at=shared_at + timedelta(days=KEPT_DAYS),
        )  # fmt: skip

    def prune(self) -> None:
        prune_kept(self.directory, KEPT_DAYS, self._lock)

    async def run_loop(self) -> None:
        """Prunes every hour, for as long as the daemon runs (shares prune too)."""
        while True:
            try:
                await asyncio.to_thread(self.prune)
            except OSError:
                logger.warning("old shared files could not be pruned", exc_info=True)
            await asyncio.sleep(PRUNE_SECONDS)
