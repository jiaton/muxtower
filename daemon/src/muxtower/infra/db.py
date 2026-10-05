"""SQLite connection factory and numbered migrations (infra/migrations/NNN_name.sql)."""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from importlib import resources
from pathlib import Path


class Database:
    """Opens a short-lived connection per unit of work, so sync routes running in FastAPI's
    threadpool never share a connection across threads."""

    def __init__(self, path: Path) -> None:
        self.path = path

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path, timeout=5)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def migrate(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY)")
            applied = {row["version"] for row in conn.execute("SELECT version FROM schema_migrations")}
            migrations = resources.files("muxtower.infra.migrations").iterdir()
            scripts = sorted((f for f in migrations if f.name.endswith(".sql")), key=lambda f: f.name)
            for script in scripts:
                version = script.name.removesuffix(".sql")
                if version in applied:
                    continue
                conn.executescript(script.read_text())
                conn.execute("INSERT INTO schema_migrations (version) VALUES (?)", (version,))
