import sqlite3
from datetime import datetime

from muxtower.auth.ports import DeviceToken
from muxtower.infra.db import Database


def _row(row: sqlite3.Row) -> DeviceToken:
    return DeviceToken(id=row["id"], name=row["name"], created_at=row["created_at"], last_used_at=row["last_used_at"])


class SqliteTokenRepository:
    def __init__(self, db: Database) -> None:
        self.db = db

    def add(self, name: str, token_hash: str, created_at: datetime) -> DeviceToken:
        with self.db.connect() as conn:
            cur = conn.execute(
                "INSERT INTO device_tokens (name, token_hash, created_at) VALUES (?, ?, ?)",
                (name, token_hash, created_at.isoformat()),
            )
            return DeviceToken(id=cur.lastrowid or 0, name=name, created_at=created_at, last_used_at=None)

    def list(self) -> list[DeviceToken]:
        with self.db.connect() as conn:
            return [_row(r) for r in conn.execute("SELECT * FROM device_tokens ORDER BY created_at")]

    def find_by_hash(self, token_hash: str) -> DeviceToken | None:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM device_tokens WHERE token_hash = ?", (token_hash,)).fetchone()
            return _row(row) if row else None

    def touch(self, token_id: int, at: datetime) -> None:
        with self.db.connect() as conn:
            conn.execute("UPDATE device_tokens SET last_used_at = ? WHERE id = ?", (at.isoformat(), token_id))

    def remove(self, name: str) -> bool:
        with self.db.connect() as conn:
            return conn.execute("DELETE FROM device_tokens WHERE name = ?", (name,)).rowcount > 0
