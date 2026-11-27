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

Auto-read: a finished turn never makes it unread (a chatty worker the owner checks on when they like);
it is marked read at the turn's end instead. What needs the owner still shows: that is its state, not
read state. Marking it unread by hand still holds.

Placed: where the owner says it runs (a machine, a folder), for sessions whose source does not say.

Kept in memory, written through to SQLite one column at a time: a write sets only the marks it changes, so
another writer's older copy of the rest (a thread a moment behind, another instance on the database) never
puts them back.
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
    auto_read: bool = False


class MarksRepository(Protocol):
    def load(self) -> dict[str, Marks]: ...
    def save(self, session_id: str, changes: dict[str, object]) -> None:
        """Writes only the columns in `changes` (fields of `Marks`), in one transaction."""
        ...


def _time(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def _text(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _upsert(column: str) -> str:
    return (
        f"INSERT INTO session_marks (session_id, {column}) VALUES (?, ?) "  # noqa: S608 - fixed names only
        f"ON CONFLICT(session_id) DO UPDATE SET {column} = excluded.{column}"
    )


# One statement per column, built once from the fixed column names: a write sets its own column(s) and
# nothing else, so a stale copy of the other marks (another thread, another process) never writes them back.
_UPSERT = {
    name: _upsert(name)
    for name in ("finished_at", "seen_at", "marked_unread", "hidden", "machine", "folder", "notify", "pinned",
                 "auto_read")
}  # fmt: skip


def _column_value(value: object) -> object:
    if isinstance(value, datetime):
        return _text(value)
    if isinstance(value, bool):
        return int(value)
    return value


class SqliteMarksRepository:
    def __init__(self, db: Database) -> None:
        self.db = db

    def load(self) -> dict[str, Marks]:
        def record(r: sqlite3.Row) -> Marks:
            return Marks(
                _time(r["finished_at"]), _time(r["seen_at"]), bool(r["marked_unread"]), bool(r["hidden"]),
                r["machine"], r["folder"], r["notify"], bool(r["pinned"]), bool(r["auto_read"]),
            )  # fmt: skip

        with self.db.connect() as conn:
            return {r["session_id"]: record(r) for r in conn.execute("SELECT * FROM session_marks")}

    def save(self, session_id: str, changes: dict[str, object]) -> None:
        with self.db.connect() as conn:
            for column, value in changes.items():
                conn.execute(_UPSERT[column], (session_id, _column_value(value)))


class SessionMarks:
    def __init__(self, repo: MarksRepository) -> None:
        self.repo = repo
        self._lock = threading.Lock()
        self._records = repo.load()

    def _change(self, session_id: str, **changes: object) -> None:
        # Only the changed columns are written: writes of other marks, built from this copy a moment before
        # or by another process, can land in any order and never undo this one.
        with self._lock:
            record = replace(self._records.get(session_id, Marks()), **changes)  # type: ignore[arg-type]
            self._records[session_id] = record
        self.repo.save(session_id, changes)

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

    def set_auto_read(self, session_id: str, auto_read: bool) -> None:
        self._change(session_id, auto_read=auto_read)

    def carry(self, old: str, new: str, unread: bool) -> None:
        """A session that goes on as another (Continue in terminal): hidden, pinned, its pushes and auto-read
        as they were, and unread if it was (else read now). Marks the new session already has of its own stay:
        a carry only adds hidden, pinned or auto-read, and gives its pushes only to one at the default."""
        if old == new:
            return
        was, now = self.get(old), self.get(new)
        changes: dict[str, object] = {}
        for name in ("hidden", "pinned", "auto_read"):
            if getattr(was, name) and not getattr(now, name):
                changes[name] = True
        if now.notify == Marks.notify and was.notify != now.notify:
            changes["notify"] = was.notify
        if changes:
            self._change(new, **changes)
        if unread:
            self.mark_unread(new)
        else:
            self.seen(new)

    def turn_finished(self, session_id: str, at: datetime | None = None) -> bool:
        """A turn ended: unread, or, for an auto-read session, read up to now (a mark to come back to stays).
        True when it was read."""
        at = at or datetime.now(UTC)
        if self.get(session_id).auto_read:
            self._change(session_id, finished_at=at, seen_at=at)
            return True
        self.finished(session_id, at)
        return False

    def place(self, session_id: str, machine: str | None, folder: str | None) -> None:
        self._change(session_id, machine=machine or None, folder=folder or None)

    def unread(self, session_id: str, source_unread: bool, active_at: datetime) -> bool:
        """`source_unread`: the source's own flag, about activity up to `active_at`."""
        record = self.get(session_id)
        seen = record.seen_at
        if record.marked_unread:
            return True
        if record.auto_read:  # its turns are read as they end, here and wherever its source keeps its own
            return False
        if record.finished_at and (seen is None or record.finished_at > seen):
            return True
        return source_unread and (seen is None or active_at > seen)

    def seen_within(self, session_id: str, seconds: float) -> bool:
        """Someone is looking at it (clients say so every few seconds while it is open)."""
        seen = self.get(session_id).seen_at
        return seen is not None and datetime.now(UTC) - seen < timedelta(seconds=seconds)
