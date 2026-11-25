"""Where an agent works now, from its transcript: the folder its latest entry was written in.

Claude Code writes the folder of that moment into every transcript line (`cwd`), so it follows a `cd`; a
Codex rollout writes its thread's folder at each turn (`turn_context`, and `session_meta` first) under
`payload.cwd`. A transcript only grows, so each is read once per version (its mtime and size): its end
when first asked (further back, a step at a time, until a line names a folder), then only what was
appended since. A file that shrank or was replaced is read again from its end."""

import json
import os
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

FIRST_READS = (65_536, 1_048_576, 4_194_304)  # how far back the first look goes, one step at a time
CODEX_ENTRIES = ("turn_context", "session_meta")


def cwd_of(entry: Any) -> str | None:
    """The folder one transcript line was written in, when it says one."""
    if not isinstance(entry, dict):
        return None
    cwd = entry.get("cwd")
    if cwd is None and entry.get("type") in CODEX_ENTRIES and isinstance(payload := entry.get("payload"), dict):
        cwd = payload.get("cwd")
    return cwd if isinstance(cwd, str) and cwd.startswith("/") else None


def last_cwd_in(lines: list[bytes]) -> str | None:
    for line in reversed(lines):
        try:
            found = cwd_of(json.loads(line))
        except ValueError:
            continue
        if found:
            return found
    return None


@dataclass(frozen=True)
class _Read:
    stamp: tuple[int, int, int]  # (inode, mtime_ns, size) when it was read
    upto: int  # where the last whole line read ends
    cwd: str | None


class TranscriptCwds:
    """The latest folder of each transcript asked about, kept by its version."""

    def __init__(self) -> None:
        self._read: dict[str, _Read] = {}
        self._lock = threading.Lock()
        self.reads = 0  # files opened to read: what tests count

    def latest(self, transcript: str) -> str | None:
        """The folder its latest line that names one was written in; None when none does (or it is gone)."""
        try:
            st = os.stat(transcript)
        except OSError:
            with self._lock:
                self._read.pop(transcript, None)
            return None
        stamp = (st.st_ino, st.st_mtime_ns, st.st_size)
        with self._lock:
            known = self._read.get(transcript)
        if known is not None and known.stamp == stamp:
            return known.cwd
        if known is not None and known.stamp[0] == st.st_ino and known.upto <= st.st_size:
            read = self._appended(transcript, known, stamp)
        else:
            read = self._from_end(transcript, stamp)
        with self._lock:
            self._read[transcript] = read
        return read.cwd

    def forget(self, keep: set[str]) -> None:
        """Drops what was read of transcripts no longer asked about."""
        with self._lock:
            self._read = {k: v for k, v in self._read.items() if k in keep}

    def _appended(self, transcript: str, known: _Read, stamp: tuple[int, int, int]) -> _Read:
        self.reads += 1
        try:
            with Path(transcript).open("rb") as f:
                f.seek(known.upto)
                data = f.read(stamp[2] - known.upto)
        except OSError:
            return known
        whole = data.rfind(b"\n") + 1  # a line still being written is read once it ends
        cwd = last_cwd_in(data[:whole].splitlines()) or known.cwd
        return _Read(stamp, known.upto + whole, cwd)

    def _from_end(self, transcript: str, stamp: tuple[int, int, int]) -> _Read:
        self.reads += 1
        size, upto = stamp[2], 0
        try:
            with Path(transcript).open("rb") as f:
                for back in FIRST_READS:
                    start = max(0, size - back)
                    f.seek(start)
                    data = f.read(size - start)
                    whole = data.rfind(b"\n") + 1
                    upto = start + whole
                    lines = data[:whole].splitlines()
                    if start > 0 and lines:
                        lines = lines[1:]  # it starts inside a line
                    if (cwd := last_cwd_in(lines)) or start == 0:
                        return _Read(stamp, upto, cwd)
        except OSError:
            return _Read(stamp, 0, None)
        return _Read(stamp, upto, None)  # none that far back: only what comes after is read
