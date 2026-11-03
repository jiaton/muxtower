from datetime import UTC, datetime

from muxtower.infra.db import Database
from muxtower.teams.ports import TeamRecord


class SqliteTeamRepository:
    def __init__(self, db: Database) -> None:
        self.db = db

    def load(self) -> dict[str, TeamRecord]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM session_team").fetchall()
        return {
            r["session_id"]: TeamRecord(r["session_id"], r["role"], r["note"], r["project"], bool(r["project_auto"]))
            for r in rows
        }

    def save(self, record: TeamRecord) -> None:
        with self.db.connect() as conn:
            conn.execute(
                """INSERT INTO session_team (session_id, role, note, project, project_auto, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(session_id) DO UPDATE SET role = excluded.role, note = excluded.note,
                       project = excluded.project, project_auto = excluded.project_auto,
                       updated_at = excluded.updated_at""",
                (
                    record.session_id, record.role, record.note, record.project, int(record.project_auto),
                    datetime.now(UTC).isoformat(),
                ),
            )  # fmt: skip

    def rename_project(self, old: str, new: str) -> int:
        with self.db.connect() as conn:
            cur = conn.execute(
                "UPDATE session_team SET project = ?, project_auto = 0, updated_at = ? WHERE project = ?",
                (new, datetime.now(UTC).isoformat(), old),
            )
            return cur.rowcount
