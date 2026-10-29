"""What the owner did with a session, the same on all their devices: which finished turns they have not
seen yet, and which sessions they hid.

Read state:
A session is unread when it finished a turn after anyone last looked at it, when its source says so
(Remote Control keeps its own unread flag, shared with the Claude apps) for activity since then, or when
the owner marked it unread to come back to. Looking at a session (a client says so while it is open)
clears all three.

Hidden: kept out of the lists and their counts (shown on their own), and out of "done" notifications.

Pinned: listed above the others.

Notify: which push notifications it sends (`NotifyLevel`), e.g. none from a session that checks on
something every few minutes.

Placed: where the owner says it runs (a machine, a folder), for sessions whose source does not say.

Kept in memory, written through to SQLite.
"""

import sqlite3
import threading
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from typing import Protocol

from muxtower.infra.db import Database


@dataclass(frozen=True)
class Marks:
    finished_at: datetime | None = None
    seen_at: datetime | None = None
    marked_unread: bool = False
    hidden: bool = False
    machine: str | None = None
    folder: str | None = None
    notify: str = "all"
    pinned: bool = False


class MarksRepository(Protocol):
    def load(self) -> dict[str, Marks]: ...
    def save(self, session_id: str, record: Marks) -> None: ...


def _time(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def _text(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


class SqliteMarksRepository:
    def __init__(self, db: Database) -> None:
        self.db = db

    def load(self) -> dict[str, Marks]:
        def record(r: sqlite3.Row) -> Marks:
            return Marks(
                _time(r["finished_at"]), _time(r["seen_at"]), bool(r["marked_unread"]), bool(r["hidden"]),
                r["machine"], r["folder"], r["notify"], bool(r["pinned"]),
            )  # fmt: skip

        with self.db.connect() as conn:
            return {r["session_id"]: record(r) for r in conn.execute("SELECT * FROM session_marks")}

    def save(self, session_id: str, record: Marks) -> None:
        with self.db.connect() as conn:
            conn.execute(
                """INSERT INTO session_marks
                       (session_id, finished_at, seen_at, marked_unread, hidden, machine, folder, notify, pinned)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(session_id) DO UPDATE SET finished_at = excluded.finished_at,
                       seen_at = excluded.seen_at, marked_unread = excluded.marked_unread, hidden = excluded.hidden,
                       machine = excluded.machine, folder = excluded.folder, notify = excluded.notify,
                       pinned = excluded.pinned""",
                (
                    session_id,
                    _text(record.finished_at),
                    _text(record.seen_at),
                    int(record.marked_unread),
                    int(record.hidden),
                    record.machine,
                    record.folder,
                    record.notify,
                    int(record.pinned),
                ),  # fmt: skip
            )


class SessionMarks:
    def __init__(self, repo: MarksRepository) -> None:
        self.repo = repo
        self._lock = threading.Lock()
        self._records = repo.load()

    def _change(self, session_id: str, **changes: object) -> None:
        with self._lock:
            record = replace(self._records.get(session_id, Marks()), **changes)  # type: ignore[arg-type]
            self._records[session_id] = record
        self.repo.save(session_id, record)

    def get(self, session_id: str) -> Marks:
        with self._lock:
            return self._records.get(session_id, Marks())

    def finished(self, session_id: str, at: datetime | None = None) -> None:
        self._change(session_id, finished_at=at or datetime.now(UTC))

    def seen(self, session_id: str, at: datetime | None = None) -> None:
        self._change(session_id, seen_at=at or datetime.now(UTC), marked_unread=False)

    def mark_unread(self, session_id: str) -> None:
        self._change(session_id, marked_unread=True)

    def hide(self, session_id: str, hidden: bool) -> None:
        self._change(session_id, hidden=hidden)

    def pin(self, session_id: str, pinned: bool) -> None:
        self._change(session_id, pinned=pinned)

    def set_notify(self, session_id: str, level: str) -> None:
        self._change(session_id, notify=level)

    def place(self, session_id: str, machine: str | None, folder: str | None) -> None:
        self._change(session_id, machine=machine or None, folder=folder or None)

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
