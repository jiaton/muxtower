"""Triggers kept on the hub: their specs, hashed secrets, firings and the dedupe keys seen."""

import hashlib
import hmac
import json
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from muxtower.errors import Conflict, NotFound
from muxtower.infra.db import Database
from muxtower.triggers.models import Firing, Trigger, TriggerPatch, TriggerSpec

SHOWN_FIRINGS = 50  # per trigger, in its log
KEPT_FIRINGS = 500  # per trigger, in the table (the audit log keeps them all)


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(UTC)


class TriggerStore:
    def __init__(self, db: Database) -> None:
        self.db = db

    # --- triggers ------------------------------------------------------------------------------------

    def _trigger(self, row: Any, last: Any | None) -> Trigger:
        spec = json.loads(row["spec"])
        return Trigger(
            id=row["id"], name=row["name"], enabled=bool(row["enabled"]), **spec,
            created_at=datetime.fromisoformat(row["created_at"]), updated_at=datetime.fromisoformat(row["updated_at"]),
            last_fired_at=datetime.fromisoformat(last["at"]) if last else None,
            last_outcome=last["outcome"] if last else None,
        )  # fmt: skip

    def _last(self, conn: Any, trigger_id: str) -> Any:
        return conn.execute(
            "SELECT at, outcome FROM trigger_firings WHERE trigger_id = ? ORDER BY id DESC LIMIT 1", (trigger_id,)
        ).fetchone()

    def all(self) -> list[Trigger]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM triggers ORDER BY name").fetchall()
            return [self._trigger(r, self._last(conn, r["id"])) for r in rows]

    def get(self, trigger_id: str) -> Trigger:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM triggers WHERE id = ?", (trigger_id,)).fetchone()
            if row is None:
                raise NotFound("no such trigger")
            return self._trigger(row, self._last(conn, row["id"]))

    def by_name(self, name: str) -> Trigger:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM triggers WHERE name = ?", (name,)).fetchone()
            if row is None:
                raise NotFound(f"no trigger named {name!r}")
            return self._trigger(row, self._last(conn, row["id"]))

    @staticmethod
    def _spec(spec: TriggerSpec) -> str:
        return json.dumps(spec.model_dump(mode="json", exclude={"name", "enabled"}))

    def create(self, spec: TriggerSpec) -> tuple[Trigger, str]:
        """The new trigger and its secret, which is never kept (only its hash)."""
        trigger_id, secret, now = f"trg_{secrets.token_hex(6)}", secrets.token_urlsafe(32), _now().isoformat()
        with self.db.connect() as conn:
            if conn.execute("SELECT 1 FROM triggers WHERE name = ?", (spec.name,)).fetchone():
                raise Conflict(f"a trigger is already named {spec.name!r}")
            conn.execute(
                "INSERT INTO triggers (id, name, enabled, spec, secret_hash, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                (trigger_id, spec.name, int(spec.enabled), self._spec(spec), _hash(secret), now, now),
            )
        return self.get(trigger_id), secret

    def update(self, trigger_id: str, patch: TriggerPatch) -> Trigger:
        current = self.get(trigger_id)
        data = current.model_dump(include=set(TriggerSpec.model_fields))
        for field in ("name", "enabled", "filter", "dedupe", "rate_per_hour", "action"):
            value = getattr(patch, field)
            if value is not None:
                data[field] = value
        if patch.clear_dedupe:
            data["dedupe"] = None
        if patch.clear_rate:
            data["rate_per_hour"] = None
        spec = TriggerSpec.model_validate(data)
        with self.db.connect() as conn:
            taken = conn.execute("SELECT 1 FROM triggers WHERE name = ? AND id != ?", (spec.name, trigger_id))
            if taken.fetchone():
                raise Conflict(f"a trigger is already named {spec.name!r}")
            conn.execute(
                "UPDATE triggers SET name = ?, enabled = ?, spec = ?, updated_at = ? WHERE id = ?",
                (spec.name, int(spec.enabled), self._spec(spec), _now().isoformat(), trigger_id),
            )
        return self.get(trigger_id)

    def delete(self, trigger_id: str) -> None:
        self.get(trigger_id)
        with self.db.connect() as conn:
            tables = (("triggers", "id"), ("trigger_firings", "trigger_id"), ("trigger_keys", "trigger_id"))
            for table, column in tables:
                conn.execute(f"DELETE FROM {table} WHERE {column} = ?", (trigger_id,))  # noqa: S608 - fixed names

    def rotate(self, trigger_id: str) -> str:
        self.get(trigger_id)
        secret = secrets.token_urlsafe(32)
        with self.db.connect() as conn:
            conn.execute("UPDATE triggers SET secret_hash = ?, updated_at = ? WHERE id = ?",
                         (_hash(secret), _now().isoformat(), trigger_id))  # fmt: skip
        return secret

    def secret_matches(self, trigger_id: str, secret: str) -> bool:
        """Constant-time; False for an unknown trigger too (which one exists is not told)."""
        with self.db.connect() as conn:
            row = conn.execute("SELECT secret_hash FROM triggers WHERE id = ?", (trigger_id,)).fetchone()
        return bool(row) and hmac.compare_digest(row["secret_hash"], _hash(secret))

    # --- firings and keys ----------------------------------------------------------------------------

    def record(self, firing: Firing) -> Firing:
        with self.db.connect() as conn:
            cur = conn.execute(
                "INSERT INTO trigger_firings (trigger_id, at, via, key, outcome, target, detail, bytes)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (firing.trigger_id, firing.at.isoformat(), firing.via, firing.key, firing.outcome, firing.target,
                 firing.detail, firing.bytes),
            )  # fmt: skip
            conn.execute(
                "DELETE FROM trigger_firings WHERE trigger_id = ? AND id NOT IN"
                " (SELECT id FROM trigger_firings WHERE trigger_id = ? ORDER BY id DESC LIMIT ?)",
                (firing.trigger_id, firing.trigger_id, KEPT_FIRINGS),
            )
            return firing.model_copy(update={"id": cur.lastrowid})

    def firings(self, trigger_id: str, limit: int = SHOWN_FIRINGS) -> list[Firing]:
        self.get(trigger_id)
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM trigger_firings WHERE trigger_id = ? ORDER BY id DESC LIMIT ?", (trigger_id, limit)
            ).fetchall()
        return [Firing.model_validate(dict(r)) for r in rows]

    def count_since(self, trigger_id: str, since: datetime, outcomes: tuple[str, ...]) -> int:
        marks = ",".join("?" * len(outcomes))
        with self.db.connect() as conn:
            row = conn.execute(
                f"SELECT COUNT(*) AS n FROM trigger_firings WHERE trigger_id = ? AND at >= ? AND outcome IN ({marks})",  # noqa: S608
                (trigger_id, since.isoformat(), *outcomes),
            ).fetchone()
        return int(row["n"])

    def targets(self, trigger_id: str, outcome: str) -> list[str]:
        """The sessions its firings with this outcome went to (or started), newest first, each once."""
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT target FROM trigger_firings WHERE trigger_id = ? AND outcome = ? AND target IS NOT NULL"
                " GROUP BY target ORDER BY MAX(id) DESC",
                (trigger_id, outcome),
            ).fetchall()
        return [r["target"] for r in rows]

    def seen(self, trigger_id: str, key: str, days: int) -> bool:
        """Whether the key came within `days` (keys older than that are let go). Not kept by asking: an
        event is remembered (`remember`) only once it goes on to its action."""
        now = _now()
        with self.db.connect() as conn:
            conn.execute("DELETE FROM trigger_keys WHERE trigger_id = ? AND at < ?",
                         (trigger_id, (now - timedelta(days=days)).isoformat()))  # fmt: skip
            found = conn.execute("SELECT 1 FROM trigger_keys WHERE trigger_id = ? AND key = ?", (trigger_id, key))
            return found.fetchone() is not None

    def remember(self, trigger_id: str, key: str) -> None:
        with self.db.connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO trigger_keys (trigger_id, key, at) VALUES (?, ?, ?)",
                (trigger_id, key, _now().isoformat()),
            )
