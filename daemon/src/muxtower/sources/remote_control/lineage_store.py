"""Where each Remote Control session came from, kept in SQLite (`rc_lineage`): read at start, written when
a session is first read or searched, so neither happens again after a restart."""

from datetime import UTC, datetime

from muxtower.infra.db import Database
from muxtower.sources.remote_control.lineage import Lineage


def how(lineage: Lineage) -> str:
    if lineage.parent:
        return "tag"
    if not lineage.copied:
        return "not-a-copy"
    if lineage.searched:
        return "searched-found" if lineage.found_in else "searched-none"
    return "copy-unsearched"  # placed by its first message if another session starts with it, else searched


class SqliteLineageStore:
    def __init__(self, db: Database) -> None:
        self.db = db

    def load(self) -> dict[str, Lineage]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM rc_lineage").fetchall()
        return {
            r["session_id"]: Lineage(
                first=r["first"], copied=bool(r["copied"]), side_chat=bool(r["side_chat"]), parent=r["parent"],
                searched=bool(r["searched"]), found_in=r["found_in"], written=r["written"],
            )
            for r in rows
        }  # fmt: skip

    def save(self, session_id: str, lineage: Lineage) -> None:
        with self.db.connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO rc_lineage (session_id, first, written, copied, side_chat, parent, searched,"
                " found_in, how, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    session_id, lineage.first, lineage.written, int(lineage.copied), int(lineage.side_chat),
                    lineage.parent, int(lineage.searched), lineage.found_in, how(lineage),
                    datetime.now(UTC).isoformat(),
                ),
            )  # fmt: skip

    def forget(self, session_id: str | None) -> int:
        """Forgets one session's (or, None, every session's) lineage: worked out again when next seen."""
        with self.db.connect() as conn:
            if session_id is None:
                return conn.execute("DELETE FROM rc_lineage").rowcount
            return conn.execute("DELETE FROM rc_lineage WHERE session_id = ?", (session_id,)).rowcount
