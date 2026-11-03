from datetime import datetime

from muxtower.concierge.ports import RecordedEvent
from muxtower.infra.db import Database

KEEP = 200  # the latest events kept; older ones are dropped as new ones come


class SqliteConciergeEvents:
    def __init__(self, db: Database) -> None:
        self.db = db

    def next_number(self) -> int:
        with self.db.connect() as conn:
            return int(conn.execute("SELECT COALESCE(MAX(number), 0) FROM concierge_events").fetchone()[0]) + 1

    def add(self, number: int, at: datetime, session_id: str, line: str) -> None:
        with self.db.connect() as conn:
            conn.execute(
                "INSERT INTO concierge_events (number, at, session_id, line) VALUES (?, ?, ?, ?)",
                (number, at.isoformat(), session_id, line),
            )
            conn.execute("DELETE FROM concierge_events WHERE number <= ?", (number - KEEP,))

    def after(self, number: int, limit: int) -> list[RecordedEvent]:
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT number, line, delivered FROM concierge_events WHERE number > ? ORDER BY number LIMIT ?",
                (number, limit),
            ).fetchall()
        return [RecordedEvent(r["number"], r["line"], bool(r["delivered"])) for r in rows]

    def undelivered(self) -> list[RecordedEvent]:
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT number, line FROM concierge_events WHERE delivered = 0 ORDER BY number"
            ).fetchall()
        return [RecordedEvent(r["number"], r["line"], False) for r in rows]

    def mark_delivered(self, up_to: int) -> None:
        with self.db.connect() as conn:
            conn.execute("UPDATE concierge_events SET delivered = 1 WHERE number <= ? AND delivered = 0", (up_to,))
