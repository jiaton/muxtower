"""Diagnostic logs from devices: one JSON line per entry under <state_dir>/diagnostics/<source>.jsonl.
The daemon stores entries as they come; the client builds them from counters and timestamps only."""

import json
import os
import re
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from muxtower.errors import Invalid

SOURCE = re.compile(r"^[a-z0-9-]{1,32}$")
MAX_ENTRIES = 500
MAX_BODY_BYTES = 256 * 1024
ROTATE_BYTES = 5 * 1024 * 1024


class DiagnosticsService:
    def __init__(self, directory: Path, rotate_bytes: int = ROTATE_BYTES) -> None:
        self.directory = directory
        self.rotate_bytes = rotate_bytes
        self._lock = threading.Lock()

    def path(self, source: str) -> Path:
        if not SOURCE.fullmatch(source):
            raise Invalid("source must be 1-32 of a-z, 0-9 and -")
        path = self.directory / f"{source}.jsonl"
        assert path.resolve().parent == self.directory.resolve()
        return path

    def append(self, source: str, device: str, entries: list[dict[str, Any]]) -> None:
        if len(entries) > MAX_ENTRIES:
            raise Invalid(f"at most {MAX_ENTRIES} entries")
        path = self.path(source)
        received = datetime.now(UTC).isoformat()
        lines = "".join(
            json.dumps({"device": device, "received": received, "entry": e}, ensure_ascii=False) + "\n" for e in entries
        )
        with self._lock:
            self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            if path.exists() and path.stat().st_size >= self.rotate_bytes:
                os.replace(path, path.with_name(path.name + ".1"))
            fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
            with os.fdopen(fd, "a", encoding="utf-8") as file:
                file.write(lines)
