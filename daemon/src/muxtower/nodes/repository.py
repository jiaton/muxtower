import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

from muxtower.infra.db import Database


@dataclass
class NodeRecord:
    name: str
    token_hash: str
    joined_at: datetime
    last_seen: datetime | None = None
    version: str | None = None
    runtimes: list[dict[str, Any]] = field(default_factory=list)
    sessions: list[dict[str, Any]] = field(default_factory=list)  # as the node reported them, its own ids


class NodeRepository(Protocol):
    def list(self) -> list[NodeRecord]: ...
    def add(self, record: NodeRecord) -> None: ...
    def save(self, record: NodeRecord) -> None: ...
    def delete(self, name: str) -> bool: ...


def _time(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


class SqliteNodeRepository:
    def __init__(self, db: Database) -> None:
        self.db = db

    def list(self) -> list[NodeRecord]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM nodes ORDER BY name").fetchall()
        return [
            NodeRecord(
                name=r["name"],
                token_hash=r["token_hash"],
                joined_at=_time(r["joined_at"]) or datetime.now(UTC),
                last_seen=_time(r["last_seen"]),
                version=r["version"],
                runtimes=json.loads(r["runtimes"]),
                sessions=json.loads(r["sessions"]),
            )  # fmt: skip
            for r in rows
        ]

    def add(self, record: NodeRecord) -> None:
        with self.db.connect() as conn:
            conn.execute(
                "INSERT INTO nodes (name, token_hash, joined_at) VALUES (?, ?, ?)",
                (record.name, record.token_hash, record.joined_at.isoformat()),
            )

    def save(self, record: NodeRecord) -> None:
        """What it last reported."""
        with self.db.connect() as conn:
            conn.execute(
                "UPDATE nodes SET last_seen = ?, version = ?, runtimes = ?, sessions = ? WHERE name = ?",
                (
                    record.last_seen.isoformat() if record.last_seen else None, record.version,
                    json.dumps(record.runtimes), json.dumps(record.sessions), record.name,
                ),
            )  # fmt: skip

    def delete(self, name: str) -> bool:
        with self.db.connect() as conn:
            return conn.execute("DELETE FROM nodes WHERE name = ?", (name,)).rowcount > 0
