"""Every name a session went by, offered when renaming it (GET /v1/sessions/{id}/names): the ones muxtower
gave, the titles Claude Code made itself (again after a compaction or a restart), the ones set in Claude
(`/rename`), Remote Control's titles and a Codex thread's names. A name seen again is only seen later.

A session's past names from before this was kept are read from its transcript once, when first asked for
(`ai-title` and `custom-title` lines, timed by the nearest line before them that has a time). A session
that takes over another (resumed under a new id) takes over its names too."""

import json
import threading
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from muxtower.infra.db import Database

MUXTOWER, CLAUDE, SET_IN_CLAUDE, REMOTE_CONTROL, CODEX = (
    "muxtower",
    "claude",
    "set in claude",
    "remote control",
    "codex",
)
OFFERED = 10
WRITE_AGAIN_SECONDS = 300  # a name seen again is written at most this often (every listing sees it)


@dataclass(frozen=True)
class NameSeen:
    name: str
    source: str
    last_seen: datetime


def from_transcript(path: str) -> list[tuple[str, str, datetime | None]]:
    """Blocking. (name, source, when) for each title line of a Claude Code transcript."""
    found: list[tuple[str, str, datetime | None]] = []
    at: datetime | None = None
    try:
        with Path(path).open(encoding="utf-8", errors="replace") as lines:
            for line in lines:
                if '"timestamp"' not in line and "-title" not in line:
                    continue
                try:
                    entry = json.loads(line)
                except ValueError:
                    continue
                if isinstance(stamp := entry.get("timestamp"), str):
                    try:
                        at = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
                    except ValueError:
                        pass
                kind = entry.get("type")
                if kind == "ai-title" and isinstance(t := entry.get("aiTitle"), str) and t.strip():
                    found.append((t.strip(), CLAUDE, at))
                elif kind == "custom-title" and isinstance(t := entry.get("customTitle"), str) and t.strip():
                    found.append((t.strip(), SET_IN_CLAUDE, at))
    except OSError:
        return []
    return found


class SessionNames:
    def __init__(self, db: Database) -> None:
        self.db = db
        self._lock = threading.Lock()
        self._written: dict[tuple[str, str], float] = {}  # (session, name) -> when last written
        self._read: set[str] = set()  # sessions whose transcript was read for past names

    def note(self, session_id: str, name: str | None, source: str, when: datetime | None = None) -> None:
        name = " ".join((name or "").split())[:200]
        if not name:
            return
        key = (session_id, name)
        with self._lock:
            if when is None and time.monotonic() - self._written.get(key, -1e9) < WRITE_AGAIN_SECONDS:
                return
            self._written[key] = time.monotonic()
        at = (when or datetime.now(UTC)).isoformat()
        with self.db.connect() as conn:
            conn.execute(
                "INSERT INTO session_names (session_id, name, source, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)"
                " ON CONFLICT(session_id, name) DO UPDATE SET"
                " last_seen = MAX(last_seen, excluded.last_seen), first_seen = MIN(first_seen, excluded.first_seen)",
                (session_id, name, source, at, at),
            )

    def backfill(self, session_id: str, transcript: str | None) -> None:
        """Blocking. Its past names from its transcript, once."""
        with self._lock:
            if session_id in self._read or not transcript:
                return
            self._read.add(session_id)
        for name, source, at in from_transcript(transcript):
            self.note(session_id, name, source, at or datetime.fromtimestamp(Path(transcript).stat().st_mtime, UTC))

    def inherit(self, old: str, new: str) -> None:
        """A session that takes over another (resumed under a new id) takes over its names."""
        if old == new:
            return
        with self.db.connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO session_names (session_id, name, source, first_seen, last_seen)"
                " SELECT ?, name, source, first_seen, last_seen FROM session_names WHERE session_id = ?",
                (new, old),
            )

    def offered(self, session_id: str, current: str) -> list[NameSeen]:
        """Its other names, latest first, at most OFFERED."""
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT name, source, last_seen FROM session_names WHERE session_id = ? AND name != ?"
                " ORDER BY last_seen DESC LIMIT ?",
                (session_id, " ".join(current.split()), OFFERED),
            ).fetchall()
        return [NameSeen(r["name"], r["source"], datetime.fromisoformat(r["last_seen"])) for r in rows]
