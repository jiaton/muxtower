from datetime import UTC, datetime

from muxtower.infra.db import Database

KEEP = 2000


class SqliteSummaryRepository:
    def __init__(self, db: Database) -> None:
        self.db = db

    def recent(self, limit: int) -> dict[str, str]:
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT reply_hash, summary FROM reply_summaries ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return {row["reply_hash"]: row["summary"] for row in rows}

    def save(self, reply_hash: str, summary: str) -> None:
        with self.db.connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO reply_summaries (reply_hash, summary, created_at) VALUES (?, ?, ?)",
                (reply_hash, summary, datetime.now(UTC).isoformat()),
            )
            conn.execute(
                "DELETE FROM reply_summaries WHERE reply_hash NOT IN"
                " (SELECT reply_hash FROM reply_summaries ORDER BY created_at DESC LIMIT ?)",
                (KEEP,),
            )
