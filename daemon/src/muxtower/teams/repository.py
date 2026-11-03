import sqlite3
from datetime import UTC, datetime

from muxtower.infra.db import Database
from muxtower.teams.ports import Task, TeamRecord


class SqliteTeamRepository:
    def __init__(self, db: Database) -> None:
        self.db = db

    def load(self) -> dict[str, TeamRecord]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM session_team").fetchall()
        return {
            r["session_id"]: TeamRecord(
                r["session_id"], r["role"], r["note"], r["project"], bool(r["project_auto"]), r["agent_id"]
            )
            for r in rows
        }

    def save(self, record: TeamRecord) -> None:
        with self.db.connect() as conn:
            conn.execute(
                """INSERT INTO session_team (session_id, role, note, project, project_auto, agent_id, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(session_id) DO UPDATE SET role = excluded.role, note = excluded.note,
                       project = excluded.project, project_auto = excluded.project_auto,
                       agent_id = excluded.agent_id, updated_at = excluded.updated_at""",
                (
                    record.session_id, record.role, record.note, record.project, int(record.project_auto),
                    record.agent_id, datetime.now(UTC).isoformat(),
                ),
            )  # fmt: skip

    def rename_project(self, old: str, new: str) -> int:
        with self.db.connect() as conn:
            cur = conn.execute(
                "UPDATE session_team SET project = ?, project_auto = 0, updated_at = ? WHERE project = ?",
                (new, datetime.now(UTC).isoformat(), old),
            )
            return cur.rowcount


KEEP_TASKS = 500
TEXT_KEPT = 200  # of a delivered task's text; a held one is kept whole until it is delivered


def _task(r: sqlite3.Row) -> Task:
    delivered = datetime.fromisoformat(r["delivered_at"]) if r["delivered_at"] else None
    at = datetime.fromisoformat(r["at"])
    return Task(r["id"], at, r["from_id"], r["from_label"], r["to_id"], r["text"], r["status"], delivered)


class SqliteTaskRepository:
    def __init__(self, db: Database) -> None:
        self.db = db

    def add(self, task: Task) -> Task:
        text = task.text if task.status == "held" else task.text[:TEXT_KEPT]
        with self.db.connect() as conn:
            cur = conn.execute(
                """INSERT INTO team_tasks (at, from_id, from_label, to_id, text, status, delivered_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    task.at.isoformat(), task.from_id, task.from_label, task.to_id, text, task.status,
                    task.delivered_at.isoformat() if task.delivered_at else None,
                ),
            )  # fmt: skip
            task_id = int(cur.lastrowid or 0)
            conn.execute("DELETE FROM team_tasks WHERE id <= ? AND status != 'held'", (task_id - KEEP_TASKS,))
        task.id = task_id
        return task

    def update(self, task: Task) -> None:
        text = task.text if task.status == "held" else task.text[:TEXT_KEPT]
        with self.db.connect() as conn:
            conn.execute(
                "UPDATE team_tasks SET text = ?, status = ?, delivered_at = ? WHERE id = ?",
                (text, task.status, task.delivered_at.isoformat() if task.delivered_at else None, task.id),
            )

    def held(self) -> list[Task]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM team_tasks WHERE status = 'held' ORDER BY id").fetchall()
        return [_task(r) for r in rows]

    def latest_to(self, session_ids: list[str], each: int) -> dict[str, list[Task]]:
        found: dict[str, list[Task]] = {}
        with self.db.connect() as conn:
            for session_id in session_ids:
                rows = conn.execute(
                    "SELECT * FROM team_tasks WHERE to_id = ? ORDER BY id DESC LIMIT ?", (session_id, each)
                ).fetchall()
                if rows:
                    found[session_id] = [_task(r) for r in rows]
        return found
