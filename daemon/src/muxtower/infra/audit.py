import logging
from datetime import UTC, datetime

from muxtower.infra.db import Database

logger = logging.getLogger("muxtower.audit")


class AuditLog:
    """Every mutating action: who (token name), what, which session. Never the typed text itself."""

    def __init__(self, db: Database) -> None:
        self.db = db

    def record(self, actor: str, action: str, session_id: str | None = None, detail: str | None = None) -> None:
        logger.info("%s %s session=%s %s", actor, action, session_id or "-", detail or "")
        with self.db.connect() as conn:
            conn.execute(
                "INSERT INTO audit_log (at, actor, action, session_id, detail) VALUES (?, ?, ?, ?, ?)",
                (datetime.now(UTC).isoformat(), actor, action, session_id, detail),
            )

    def messages(self, since: datetime, limit: int = 500) -> list[tuple[datetime, str, str]]:
        """What sessions typed into others since then (MCP send_message): (when, who, to which session),
        oldest first. The text itself is never kept."""
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT at, actor, session_id FROM audit_log WHERE action = 'mcp:send_message' AND at >= ?"
                " AND session_id IS NOT NULL ORDER BY at DESC LIMIT ?",
                (since.isoformat(), limit),
            ).fetchall()
        return [(datetime.fromisoformat(r["at"]), r["actor"], r["session_id"]) for r in reversed(rows)]

    def owner_touches(self, since: datetime) -> dict[str, int]:
        """How often the owner (a paired device, not a session, a node or muxtower itself) typed into,
        approved or denied in each session since then."""
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT session_id, COUNT(*) AS n FROM audit_log WHERE action IN ('input', 'approve', 'deny')"
                " AND at >= ? AND session_id IS NOT NULL AND actor NOT LIKE 'session %' AND actor NOT LIKE 'node %'"
                " AND actor NOT IN ('hub', 'auto-approve') GROUP BY session_id",
                (since.isoformat(),),
            ).fetchall()
        return {r["session_id"]: r["n"] for r in rows}
