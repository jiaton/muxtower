from datetime import UTC, datetime

from muxtower.continuing.models import ContinueStep
from muxtower.continuing.ports import Job
from muxtower.infra.db import Database


class SqliteJobStore:
    def __init__(self, db: Database) -> None:
        self.db = db

    def get(self, remote_id: str) -> Job | None:
        with self.db.connect() as conn:
            r = conn.execute("SELECT * FROM continued_sessions WHERE remote_id = ?", (remote_id,)).fetchone()
        if r is None:
            return None
        return Job(
            r["remote_id"], r["machine"], r["node"], r["cwd"], r["agent_id"], r["name"], bool(r["unread"]),
            ContinueStep(r["step"]), bool(r["closed"]), r["reason"], r["session_id"],
        )  # fmt: skip

    def save(self, job: Job) -> None:
        with self.db.connect() as conn:
            conn.execute(
                """INSERT INTO continued_sessions
                       (remote_id, machine, node, cwd, agent_id, name, unread, step, closed, reason, session_id,
                        updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(remote_id) DO UPDATE SET machine = excluded.machine, node = excluded.node,
                       cwd = excluded.cwd, agent_id = excluded.agent_id, name = excluded.name,
                       unread = excluded.unread, step = excluded.step, closed = excluded.closed,
                       reason = excluded.reason, session_id = excluded.session_id, updated_at = excluded.updated_at""",
                (
                    job.remote_id, job.machine, job.node, job.cwd, job.agent_id, job.name, int(job.unread),
                    job.step.value, int(job.closed), job.reason, job.session_id, datetime.now(UTC).isoformat(),
                ),
            )  # fmt: skip
