"""SQLite access: one shared connection guarded by a lock, plus numbered migrations
(infra/migrations/NNN_name.sql).

One long-lived connection instead of open/close per call: closing the last connection checkpoints the
WAL, and on slow disks every commit's fsync dominated request time. WAL + synchronous=NORMAL is the
standard durable-enough setting (a power cut can lose the last commit, never corrupt the file)."""

import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from importlib import resources
from pathlib import Path


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = threading.RLock()
        self._conn: sqlite3.Connection | None = None

    def _connection(self) -> sqlite3.Connection:
        if self._conn is None:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(self.path, timeout=5, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute("PRAGMA synchronous = NORMAL")
            conn.execute("PRAGMA foreign_keys = ON")
            self._conn = conn
        return self._conn

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        """A transaction on the shared connection: commits on success, rolls back on error."""
        with self._lock:
            conn = self._connection()
            with conn:
                yield conn

    def close(self) -> None:
        with self._lock:
            if self._conn is not None:
                self._conn.close()
                self._conn = None

    def migrate(self) -> None:
        with self.connect() as conn:
            conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY)")
            applied = {row["version"] for row in conn.execute("SELECT version FROM schema_migrations")}
            migrations = resources.files("muxtower.infra.migrations").iterdir()
            scripts = sorted((f for f in migrations if f.name.endswith(".sql")), key=lambda f: f.name)
            for script in scripts:
                version = script.name.removesuffix(".sql")
                if version in applied:
                    continue
                for statement in script.read_text().split(";"):
                    if statement.strip():
                        conn.execute(statement)
                conn.execute("INSERT INTO schema_migrations (version) VALUES (?)", (version,))
