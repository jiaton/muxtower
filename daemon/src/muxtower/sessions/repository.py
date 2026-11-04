import json
import sqlite3
from datetime import datetime

from muxtower.infra.db import Database
from muxtower.sessions.ports import SessionRecord, SessionSource
from muxtower.terminal.ports import PaneRef


def _record(row: sqlite3.Row) -> SessionRecord:
    return SessionRecord(
        id=row["id"],
        name=row["name"],
        runtime=row["runtime"],
        cwd=row["cwd"],
        source=SessionSource(row["source"]),
        pane=PaneRef(socket=row["socket"], pane_id=row["pane_id"]),
        tmux_session=row["tmux_session"],
        hook_token_hash=row["hook_token_hash"],
        auto_approve=bool(row["auto_approve"]),
        created_at=datetime.fromisoformat(row["created_at"]),
        named=bool(row["named"]),
        named_at=datetime.fromisoformat(row["named_at"]) if row["named_at"] else None,
        launch_args=json.loads(row["launch_args"]) if row["launch_args"] else None,
        agent_id=row["agent_id"],
        server_id=row["server_id"],
        interrupted_at=datetime.fromisoformat(row["interrupted_at"]) if row["interrupted_at"] else None,
    )


class SqliteSessionRepository:
    def __init__(self, db: Database) -> None:
        self.db = db

    def list(self) -> list[SessionRecord]:
        with self.db.connect() as conn:
            return [_record(r) for r in conn.execute("SELECT * FROM sessions ORDER BY created_at")]

    def get(self, session_id: str) -> SessionRecord | None:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
            return _record(row) if row else None

    def upsert(self, r: SessionRecord) -> None:
        """Adds it, or (the same id) replaces what can change: also its pane, token and source, for a session
        started again under its own id after a restart."""
        with self.db.connect() as conn:
            conn.execute(
                """INSERT INTO sessions (id, name, runtime, cwd, source, socket, tmux_session, pane_id,
                                         hook_token_hash, auto_approve, created_at, named, launch_args, agent_id,
                                         server_id, interrupted_at, named_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET name = excluded.name, runtime = excluded.runtime,
                       cwd = excluded.cwd, source = excluded.source, socket = excluded.socket,
                       tmux_session = excluded.tmux_session, pane_id = excluded.pane_id,
                       hook_token_hash = excluded.hook_token_hash, auto_approve = excluded.auto_approve,
                       named = excluded.named, launch_args = excluded.launch_args, agent_id = excluded.agent_id,
                       server_id = excluded.server_id, interrupted_at = excluded.interrupted_at,
                       named_at = excluded.named_at""",
                (
                    r.id, r.name, r.runtime, r.cwd, r.source.value, r.pane.socket, r.tmux_session,
                    r.pane.pane_id, r.hook_token_hash, int(r.auto_approve), r.created_at.isoformat(), int(r.named),
                    json.dumps(r.launch_args) if r.launch_args is not None else None, r.agent_id, r.server_id,
                    r.interrupted_at.isoformat() if r.interrupted_at else None,
                    r.named_at.isoformat() if r.named_at else None,
                ),
            )  # fmt: skip

    def save_hook_state(self, session_id: str, state: str | None) -> None:
        with self.db.connect() as conn:
            conn.execute("UPDATE sessions SET hook_state = ? WHERE id = ?", (state, session_id))

    def load_hook_state(self, session_id: str) -> str | None:
        with self.db.connect() as conn:
            row = conn.execute("SELECT hook_state FROM sessions WHERE id = ?", (session_id,)).fetchone()
            return row["hook_state"] if row else None

    def delete(self, session_id: str) -> None:
        with self.db.connect() as conn:
            conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
