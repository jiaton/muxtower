import sqlite3
from datetime import datetime

from muxtower.infra.db import Database
from muxtower.sessions.ports import ArchiveRecord


def _record(row: sqlite3.Row) -> ArchiveRecord:
    return ArchiveRecord(
        session_id=row["session_id"],
        remote_id=row["remote_id"],
        session=row["session"],
        transcript=row["transcript"],
        items=row["items"],
        archived_at=datetime.fromisoformat(row["archived_at"]),
    )


class SqliteArchiveRepository:
    def __init__(self, db: Database) -> None:
        self.db = db

    def list(self) -> list[ArchiveRecord]:
        with self.db.connect() as conn:
            return [_record(r) for r in conn.execute("SELECT * FROM archived_sessions ORDER BY archived_at")]

    def add(self, record: ArchiveRecord) -> None:
        with self.db.connect() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO archived_sessions
                   (session_id, remote_id, session, transcript, items, archived_at) VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    record.session_id,
                    record.remote_id,
                    record.session,
                    record.transcript,
                    record.items,
                    record.archived_at.isoformat(),
                ),
            )

    def delete(self, session_id: str) -> None:
        with self.db.connect() as conn:
            conn.execute("DELETE FROM archived_sessions WHERE session_id = ?", (session_id,))
