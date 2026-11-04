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
    platform: str | None = None  # sys.platform there
    running: list[dict[str, Any]] = field(default_factory=list)  # its Claude Code processes (`processes.py`)
    reported_url: str | None = None  # where it says the app can reach it (`direct.py`)
    direct_url: str | None = None  # the owner's address for it, over the reported one


class NodeRepository(Protocol):
    def list(self) -> list[NodeRecord]: ...
    def add(self, record: NodeRecord) -> None: ...
    def save(self, record: NodeRecord) -> None: ...
    def delete(self, name: str) -> bool: ...
    def owe_revocation(self, node: str, token_name: str) -> None: ...
    def revocations(self, node: str) -> tuple[str, ...]: ...
    def revoked(self, node: str, token_name: str) -> None: ...


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
                platform=r["platform"],
                running=json.loads(r["running"]),
                reported_url=r["reported_url"],
                direct_url=r["direct_url"],
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
                "UPDATE nodes SET last_seen = ?, version = ?, runtimes = ?, sessions = ?, platform = ?, running = ?,"
                " reported_url = ?, direct_url = ? WHERE name = ?",
                (
                    record.last_seen.isoformat() if record.last_seen else None, record.version,
                    json.dumps(record.runtimes), json.dumps(record.sessions), record.platform,
                    json.dumps(record.running), record.reported_url, record.direct_url, record.name,
                ),
            )  # fmt: skip

    def delete(self, name: str) -> bool:
        with self.db.connect() as conn:
            conn.execute("DELETE FROM node_revocations WHERE node = ?", (name,))
            return conn.execute("DELETE FROM nodes WHERE name = ?", (name,)).rowcount > 0

    def owe_revocation(self, node: str, token_name: str) -> None:
        with self.db.connect() as conn:
            conn.execute("INSERT OR IGNORE INTO node_revocations (node, token_name) VALUES (?, ?)", (node, token_name))

    def revocations(self, node: str) -> tuple[str, ...]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT token_name FROM node_revocations WHERE node = ?", (node,)).fetchall()
        return tuple(r["token_name"] for r in rows)

    def revoked(self, node: str, token_name: str) -> None:
        with self.db.connect() as conn:
            conn.execute("DELETE FROM node_revocations WHERE node = ? AND token_name = ?", (node, token_name))
