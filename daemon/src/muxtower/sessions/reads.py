"""Which finished turns the owner has not seen yet, across all their devices.

A session is unread when it finished a turn after anyone last looked at it, when its source says so
(Remote Control keeps its own unread flag, shared with the Claude apps) for activity since then, or when
the owner marked it unread to come back to. Looking at a session (a client says so while it is open)
clears all three. Kept in memory, written through to SQLite.
"""

import sqlite3
import threading
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from typing import Protocol

from muxtower.infra.db import Database


@dataclass(frozen=True)
class ReadRecord:
    finished_at: datetime | None = None
    seen_at: datetime | None = None
    marked_unread: bool = False


class ReadRepository(Protocol):
    def load(self) -> dict[str, ReadRecord]: ...
    def save(self, session_id: str, record: ReadRecord) -> None: ...


def _time(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def _text(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


class SqliteReadRepository:
    def __init__(self, db: Database) -> None:
        self.db = db

    def load(self) -> dict[str, ReadRecord]:
        def record(r: sqlite3.Row) -> ReadRecord:
            return ReadRecord(_time(r["finished_at"]), _time(r["seen_at"]), bool(r["marked_unread"]))

        with self.db.connect() as conn:
            return {r["session_id"]: record(r) for r in conn.execute("SELECT * FROM session_reads")}

    def save(self, session_id: str, record: ReadRecord) -> None:
        with self.db.connect() as conn:
            conn.execute(
                """INSERT INTO session_reads (session_id, finished_at, seen_at, marked_unread) VALUES (?, ?, ?, ?)
                   ON CONFLICT(session_id) DO UPDATE SET finished_at = excluded.finished_at,
                       seen_at = excluded.seen_at, marked_unread = excluded.marked_unread""",
                (session_id, _text(record.finished_at), _text(record.seen_at), int(record.marked_unread)),
            )


class Reads:
    def __init__(self, repo: ReadRepository) -> None:
        self.repo = repo
        self._lock = threading.Lock()
        self._records = repo.load()

    def _change(self, session_id: str, **changes: object) -> None:
        with self._lock:
            record = replace(self._records.get(session_id, ReadRecord()), **changes)  # type: ignore[arg-type]
            self._records[session_id] = record
        self.repo.save(session_id, record)

    def get(self, session_id: str) -> ReadRecord:
        with self._lock:
            return self._records.get(session_id, ReadRecord())

    def finished(self, session_id: str, at: datetime | None = None) -> None:
        self._change(session_id, finished_at=at or datetime.now(UTC))

    def seen(self, session_id: str, at: datetime | None = None) -> None:
        self._change(session_id, seen_at=at or datetime.now(UTC), marked_unread=False)

    def mark_unread(self, session_id: str) -> None:
        self._change(session_id, marked_unread=True)

    def unread(self, session_id: str, source_unread: bool, active_at: datetime) -> bool:
        """`source_unread`: the source's own flag, about activity up to `active_at`."""
        record = self.get(session_id)
        seen = record.seen_at
        if record.marked_unread:
            return True
        if record.finished_at and (seen is None or record.finished_at > seen):
            return True
        return source_unread and (seen is None or active_at > seen)

    def seen_within(self, session_id: str, seconds: float) -> bool:
        """Someone is looking at it (clients say so every few seconds while it is open)."""
        seen = self.get(session_id).seen_at
        return seen is not None and datetime.now(UTC) - seen < timedelta(seconds=seconds)
