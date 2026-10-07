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
