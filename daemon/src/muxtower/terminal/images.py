"""Images sent with a message to an agent in a terminal: saved under the state directory and pasted in as
their paths, which Claude Code (and Codex) take for the images themselves. Kept a day."""

import base64
import binascii
import hashlib
import time
from pathlib import Path

from muxtower.errors import Invalid
from muxtower.terminal.models import ImageInput

EXTENSIONS = {"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp"}
KEEP_SECONDS = 86_400


class ImageDrop:
    def __init__(self, directory: Path) -> None:
        self.directory = directory

    def save(self, image: ImageInput) -> Path:
        try:
            data = base64.b64decode(image.data, validate=True)
        except binascii.Error as exc:
            raise Invalid("an image is not base64") from exc
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        self._prune()
        path = self.directory / f"{hashlib.sha256(data).hexdigest()[:20]}.{EXTENSIONS[image.media_type]}"
        path.write_bytes(data)
        path.chmod(0o600)
        return path

    def _prune(self) -> None:
        old = time.time() - KEEP_SECONDS
        for path in self.directory.iterdir():
            if path.is_file() and path.stat().st_mtime < old:
                path.unlink(missing_ok=True)
