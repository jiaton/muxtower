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
        self._depth = 0  # transactions open (`transaction`), on the thread holding the lock

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
        """A transaction on the shared connection: commits on success, rolls back on error. Inside
        `transaction` it is a savepoint of that one: its error rolls back its own writes, and the outer
        transaction commits or rolls back everything."""
        with self._lock:
            conn = self._connection()
            if self._depth:
                with self._savepoint(conn):
                    yield conn
                return
            with conn:
                yield conn

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        """One transaction for several stores: every `connect` inside it (on this thread, which holds the
        lock throughout) joins it, and all of it commits at the end, or none of it on an error."""
        with self._lock:
            conn = self._connection()
            if self._depth:
                with self._savepoint(conn):
                    yield conn
                return
            with conn:
                conn.execute("BEGIN IMMEDIATE")
                self._depth = 1
                try:
                    yield conn
                finally:
                    self._depth = 0

    @contextmanager
    def _savepoint(self, conn: sqlite3.Connection) -> Iterator[None]:
        self._depth += 1
        conn.execute("SAVEPOINT nested")  # the same name nests: each refers to the latest open one
        try:
            yield
        except BaseException:
            conn.execute("ROLLBACK TO nested")
            conn.execute("RELEASE nested")
            raise
        else:
            conn.execute("RELEASE nested")
        finally:
            self._depth -= 1

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
