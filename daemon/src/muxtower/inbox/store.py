"""The Inbox's SQLite tables (`042_inbox.sql`): items, each project's default hand-off role, and small facts.
Every write of an item writes the whole row and bumps its version; history past `HISTORY_DAYS` is deleted as
the list is read."""

import sqlite3
from dataclasses import dataclass, fields, replace
from datetime import UTC, date, datetime, timedelta

from muxtower.errors import Invalid, NotFound
from muxtower.inbox.models import HISTORY_DAYS, MAX_ITEMS, InboxStatus, OnDue
from muxtower.infra.db import Database


@dataclass(frozen=True)
class Row:
    id: int
    text: str
    project: str | None
    status: InboxStatus
    created_at: datetime
    updated_at: datetime
    done_at: datetime | None
    position: int
    version: int
    handed_role: str | None = None
    handed_session: str | None = None
    handed_project: str | None = None
    handed_task_id: int | None = None
    handed_at: datetime | None = None
    due_at: datetime | None = None
    due_date: date | None = None
    on_due: OnDue = OnDue.REMIND
    target_project: str | None = None
    target_role: str | None = None
    target_session: str | None = None
    due_fired_at: datetime | None = None


COLUMNS = tuple(f.name for f in fields(Row))
_TIMES = {"created_at", "updated_at", "done_at", "handed_at", "due_at", "due_fired_at"}
SELECT = (
    "SELECT "
    "id, text, project, status, created_at, updated_at, done_at, position, version, handed_role, "
    "handed_session, handed_project, handed_task_id, handed_at, due_at, due_date, on_due, target_project, "
    "target_role, target_session, due_fired_at "
    "FROM inbox_items"
)
UPDATE = (
    "UPDATE inbox_items SET "
    "text = ?, project = ?, status = ?, created_at = ?, updated_at = ?, done_at = ?, position = ?, "
    "version = ?, handed_role = ?, handed_session = ?, handed_project = ?, handed_task_id = ?, handed_at "
    "= ?, due_at = ?, due_date = ?, on_due = ?, target_project = ?, target_role = ?, target_session = ?, "
    "due_fired_at = ? "
    "WHERE id = ?"
)
INSERT = (
    "INSERT INTO inbox_items ("
    "text, project, status, created_at, updated_at, done_at, position, version, handed_role, "
    "handed_session, handed_project, handed_task_id, handed_at, due_at, due_date, on_due, target_project, "
    "target_role, target_session, due_fired_at"
    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
)


def _row(r: sqlite3.Row) -> Row:
    values = {}
    for c in COLUMNS:
        v = r[c]
        if c in _TIMES and v is not None:
            v = datetime.fromisoformat(v)
        elif c == "due_date" and v is not None:
            v = date.fromisoformat(v)
        elif c == "status":
            v = InboxStatus(v)
        elif c == "on_due":
            v = OnDue(v)
        values[c] = v
    return Row(**values)


def _values(row: Row) -> list[object]:
    out: list[object] = []
    for c in COLUMNS[1:]:
        v = getattr(row, c)
        out.append(v.isoformat() if isinstance(v, datetime | date) else v.value if hasattr(v, "value") else v)
    return out


class InboxStore:
    def __init__(self, db: Database) -> None:
        self.db = db

    def _expire(self, conn: sqlite3.Connection, now: datetime) -> None:
        before = (now - timedelta(days=HISTORY_DAYS)).isoformat()
        conn.execute("DELETE FROM inbox_items WHERE status = 'done' AND done_at < ?", (before,))

    def listed(self, done: bool, now: datetime | None = None) -> tuple[list[Row], list[Row]]:
        """Open and handed items in order, and (`done`) the history, newest first."""
        with self.db.connect() as conn:
            self._expire(conn, now or datetime.now(UTC))
            rows = [_row(r) for r in conn.execute(SELECT + " WHERE status != 'done' ORDER BY position, id")]
            history = (
                [_row(r) for r in conn.execute(SELECT + " WHERE status = 'done' ORDER BY done_at DESC, id DESC")]
                if done
                else []
            )
        return rows, history

    def get(self, item_id: int) -> Row:
        with self.db.connect() as conn:
            found = conn.execute(SELECT + " WHERE id = ?", (item_id,)).fetchone()
        if found is None:
            raise NotFound(f"no Inbox item {item_id}")
        return _row(found)

    def add(self, row: Row) -> Row:
        """Stores it first in the order; its id given here."""
        with self.db.connect() as conn:
            count = conn.execute("SELECT COUNT(*) FROM inbox_items WHERE status != 'done'").fetchone()[0]
            if count >= MAX_ITEMS:
                raise Invalid(f"the Inbox holds at most {MAX_ITEMS} open items: close some first")
            first = conn.execute("SELECT MIN(position) FROM inbox_items WHERE status != 'done'").fetchone()[0]
            row = replace(row, position=(first - 1) if first is not None else 0)
            cursor = conn.execute(INSERT, _values(row))
            return replace(row, id=int(cursor.lastrowid or 0))

    def write(self, row: Row, if_version: int | None) -> Row | None:
        """Writes the whole row, its version bumped; None when it is no longer at `if_version` (or gone)."""
        with self.db.connect() as conn:
            found = conn.execute("SELECT version FROM inbox_items WHERE id = ?", (row.id,)).fetchone()
            if found is None:
                raise NotFound(f"no Inbox item {row.id}")
            if if_version is not None and found["version"] != if_version:
                return None
            written = replace(row, version=found["version"] + 1)
            conn.execute(UPDATE, [*_values(written), row.id])
        return written

    def delete(self, item_id: int) -> None:
        with self.db.connect() as conn:
            if conn.execute("DELETE FROM inbox_items WHERE id = ?", (item_id,)).rowcount == 0:
                raise NotFound(f"no Inbox item {item_id}")

    def order(self, ids: list[int]) -> None:
        """These first to last, the others after them as they were; each moved one's version bumped."""
        with self.db.connect() as conn:
            rows = conn.execute("SELECT id, position FROM inbox_items WHERE status != 'done' ORDER BY position, id")
            current = [r["id"] for r in rows]
            named = [i for i in dict.fromkeys(ids) if i in set(current)]
            wanted = named + [i for i in current if i not in set(named)]
            conn.executemany(
                "UPDATE inbox_items SET position = ?, version = version + 1 WHERE id = ? AND position != ?",
                [(n, i, n) for n, i in enumerate(wanted)],
            )

    def unfired(self) -> list[Row]:
        """Items with a due date the hub has not acted on yet (not done)."""
        with self.db.connect() as conn:
            rows = conn.execute(
                SELECT + " WHERE status != 'done' AND due_fired_at IS NULL "
                "AND (due_at IS NOT NULL OR due_date IS NOT NULL)"
            )
            return [_row(r) for r in rows]

    def claim(self, item_id: int, version: int, at: datetime) -> bool:
        """Marks its due date acted on, if nobody did and it is still at `version`: exactly once."""
        with self.db.connect() as conn:
            claimed = conn.execute(
                "UPDATE inbox_items SET due_fired_at = ?, version = version + 1 "
                "WHERE id = ? AND version = ? AND due_fired_at IS NULL AND status != 'done'",
                (at.isoformat(), item_id, version),
            )
            return claimed.rowcount == 1

    def untouched(self, before: datetime) -> list[Row]:
        """Open and handed items not changed since `before`, in order."""
        with self.db.connect() as conn:
            rows = conn.execute(
                SELECT + " WHERE status != 'done' AND updated_at < ? ORDER BY position, id", (before.isoformat(),)
            )
            return [_row(r) for r in rows]

    # --- each project's default hand-off role -------------------------------------------------------------

    def handoff(self, project: str) -> str | None:
        with self.db.connect() as conn:
            found = conn.execute("SELECT role FROM project_handoff WHERE project = ?", (project,)).fetchone()
        return found["role"] if found else None

    def set_handoff(self, project: str, role: str | None) -> None:
        with self.db.connect() as conn:
            if role is None:
                conn.execute("DELETE FROM project_handoff WHERE project = ?", (project,))
            else:
                conn.execute(
                    "INSERT INTO project_handoff (project, role) VALUES (?, ?) "
                    "ON CONFLICT (project) DO UPDATE SET role = excluded.role",
                    (project, role),
                )

    def rename_project(self, old: str, new: str) -> bool:
        """A project renamed (`teams/renaming.py`): its default hand-off role moves with the name (merged into
        a project that has one, that one's stays), and so do the items about it and their hand-off targets.
        Runs inside the rename's transaction. Whether it changed anything."""
        with self.db.connect() as conn:
            changed = 0
            if conn.execute("SELECT 1 FROM project_handoff WHERE project = ?", (old,)).fetchone() is not None:
                if conn.execute("SELECT 1 FROM project_handoff WHERE project = ?", (new,)).fetchone() is None:
                    conn.execute("UPDATE project_handoff SET project = ? WHERE project = ?", (new, old))
                else:
                    conn.execute("DELETE FROM project_handoff WHERE project = ?", (old,))
                changed += 1
            for statement in (
                "UPDATE inbox_items SET project = ?, version = version + 1 WHERE project = ?",
                "UPDATE inbox_items SET handed_project = ?, version = version + 1 WHERE handed_project = ?",
                "UPDATE inbox_items SET target_project = ?, version = version + 1 WHERE target_project = ?",
            ):
                changed += conn.execute(statement, (new, old)).rowcount
        return changed > 0

    # --- small facts ----------------------------------------------------------------------------------------

    def fact(self, key: str) -> str | None:
        with self.db.connect() as conn:
            found = conn.execute("SELECT value FROM inbox_state WHERE key = ?", (key,)).fetchone()
        return found["value"] if found else None

    def set_fact(self, key: str, value: str) -> None:
        with self.db.connect() as conn:
            conn.execute(
                "INSERT INTO inbox_state (key, value) VALUES (?, ?) "
                "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                (key, value),
            )
