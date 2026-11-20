"""Claude Code's files, read once until they change: its process files (`~/.claude/sessions/<pid>.json`) by
their mtime and size, and its transcripts (`~/.claude/projects/<folder>/<sessionId>.jsonl`) found by name
in one index, built again only when a folder's mtime says a transcript came or went.

The session list asks for these for every archived session each time it is listed, so reading them
afresh each time (a glob of every folder per lookup, every process file parsed per question) was most of
what the daemon did while idle."""

import json
import os
import re
import threading
import time
from pathlib import Path
from typing import Any

TAIL_BYTES = 16_384  # the end of a transcript, where a `continued-in` line is
SESSION_ID = re.compile(r"[0-9a-f-]{36}")
# How long a lookup trusts the folders as last read; `stamp()` always reads them again.
FRESH_SECONDS = 1.0
# A file or folder changed this lately may change again within the same tick of the filesystem's clock,
# its mtime the same: what was read of it is not kept as read for that mtime (git's "racy" files).
SETTLE_NS = 2_000_000_000

# (mtime_ns, size) of a file or a folder; RACY for one changed too lately to tell a later change by.
Stamp = tuple[int, int]
RACY: Stamp = (-1, -1)


def _settled(mtime_ns: int, size: int) -> Stamp:
    return (mtime_ns, size) if time.time_ns() - mtime_ns > SETTLE_NS else RACY


def _stamp(path: str | Path) -> Stamp | None:
    """Its stamp (RACY while it just changed), or None when it is not there."""
    try:
        st = os.stat(path)
    except OSError:
        return None
    return _settled(st.st_mtime_ns, st.st_size)


def _continued_in(path: Path) -> str | None:
    """The session a transcript says it goes on in: its last line, `{"type": "continued-in",
    "continuedInSessionId": …}`, which Claude Code writes when the conversation moves to another
    session (a job, another folder) while its process file still names this one."""
    try:
        with path.open("rb") as f:
            f.seek(max(0, os.fstat(f.fileno()).st_size - TAIL_BYTES))
            lines = f.read().splitlines()[-3:]
    except OSError:
        return None
    for line in reversed(lines):
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        if isinstance(entry, dict) and entry.get("type") == "continued-in":
            following = entry.get("continuedInSessionId")
            return following if isinstance(following, str) and SESSION_ID.fullmatch(following) else None
    return None


class ProcessFiles:
    """Every process file in a folder, parsed once per version of it (its mtime and size)."""

    def __init__(self, folder: Path) -> None:
        self.folder = folder
        self._parsed: dict[str, tuple[Stamp, dict[str, Any] | None]] = {}
        self._racy = 0  # `stamp()`s while the folder had just changed
        self._lock = threading.Lock()

    def read(self) -> list[tuple[Path, dict[str, Any]]]:
        """Each `*.json` and what it holds, in no particular order (one that holds no JSON object is left
        out). Callers never change what they get: it is kept for the next."""
        try:
            entries = [e for e in os.scandir(self.folder) if e.name.endswith(".json")]
        except OSError:
            entries = []
        found: list[tuple[Path, dict[str, Any]]] = []
        seen: dict[str, tuple[Stamp, dict[str, Any] | None]] = {}
        for entry in entries:
            try:
                st = entry.stat()
            except OSError:
                continue
            stamp = _settled(st.st_mtime_ns, st.st_size)
            with self._lock:
                known = self._parsed.get(entry.name)
            if known is None or known[0] != stamp or stamp == RACY:
                try:
                    parsed = json.loads(Path(entry.path).read_text())
                except (OSError, ValueError):
                    parsed = None
                known = (stamp, parsed if isinstance(parsed, dict) else None)
            seen[entry.name] = known
            if known[1] is not None:
                found.append((Path(entry.path), known[1]))
        with self._lock:
            self._parsed = seen  # those gone are forgotten
        return found

    def get(self, name: str) -> dict[str, Any] | None:
        """One file (`<pid>.json`), read again only once it changed; None when it is not there or holds no
        JSON object."""
        stamp = _stamp(self.folder / name)
        if stamp is None:
            return None
        with self._lock:
            known = self._parsed.get(name)
        if known is not None and known[0] == stamp != RACY:
            return known[1]
        try:
            parsed = json.loads((self.folder / name).read_text())
        except (OSError, ValueError):
            parsed = None
        info = parsed if isinstance(parsed, dict) else None
        with self._lock:
            self._parsed[name] = (stamp, info)
        return info

    def stamp(self) -> object:
        """What changes when a file comes or goes (a file rewritten in place may not change it)."""
        stamp = _stamp(self.folder)
        if stamp == RACY:
            with self._lock:
                self._racy += 1
                return RACY, self._racy  # never the same twice while it may still change unseen
        return stamp


class TranscriptIndex:
    """Every transcript under `projects/` by its session id, and where each says it goes on."""

    def __init__(self, projects_dir: Path) -> None:
        self.projects_dir = projects_dir
        self._folders: dict[str, Stamp] = {}  # each folder's stamp when it was last read (RACY: read it again)
        self._generation = 0  # one more each time a folder is read again or gone
        self._by_id: dict[str, dict[str, Path]] = {}  # folder name -> {session id: path}
        self._tails: dict[Path, tuple[Stamp, str | None]] = {}
        self._read_at = float("-inf")
        self._lock = threading.Lock()

    def stamp(self) -> int:
        """What changes when a transcript comes or goes anywhere under `projects/` (read now)."""
        self._refresh(0.0)
        with self._lock:
            return self._generation

    def _refresh(self, fresh: float = FRESH_SECONDS) -> None:
        if time.monotonic() - self._read_at < fresh:
            return
        try:
            folders = [e for e in os.scandir(self.projects_dir) if e.is_dir()]
        except OSError:
            folders = []
        stamps: dict[str, Stamp] = {}
        for entry in folders:
            try:
                st = entry.stat()
            except OSError:
                continue
            stamps[entry.name] = _settled(st.st_mtime_ns, st.st_size)
        with self._lock:
            changed = [n for n, s in stamps.items() if self._folders.get(n) != s or s == RACY]
            gone = [n for n in self._folders if n not in stamps]
        read: dict[str, dict[str, Path]] = {}
        for name in changed:
            folder = self.projects_dir / name
            try:
                names = [e.name for e in os.scandir(folder) if e.name.endswith(".jsonl")]
                read[name] = {n.removesuffix(".jsonl"): folder / n for n in names}
            except OSError:
                read[name] = {}
        with self._lock:
            for name in gone:
                self._by_id.pop(name, None)
                self._folders.pop(name, None)
            for name, ids in read.items():
                self._by_id[name] = ids
                self._folders[name] = stamps[name]
            if gone or changed:
                self._generation += 1
                known = {p for ids in self._by_id.values() for p in ids.values()}
                self._tails = {p: t for p, t in self._tails.items() if p in known}
            self._read_at = time.monotonic()

    def find(self, session_id: str) -> Path | None:
        """The transcript named after a session (`<id>.jsonl`), in any folder."""
        self._refresh()
        with self._lock:
            return next((ids[session_id] for ids in self._by_id.values() if session_id in ids), None)

    def continued_in(self, path: Path) -> str | None:
        """`_continued_in`, read again only once the file changed."""
        stamp = _stamp(path)
        if stamp is None:
            return None
        with self._lock:
            known = self._tails.get(path)
        if known is not None and known[0] == stamp != RACY:
            return known[1]
        following = _continued_in(path)
        with self._lock:
            self._tails[path] = (stamp, following)
        return following
