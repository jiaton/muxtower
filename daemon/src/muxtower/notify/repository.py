import json
from datetime import UTC, datetime

from muxtower.infra.db import Database
from muxtower.notify.models import Subscribe
from muxtower.notify.ports import StoredSubscription


class SqliteSubscriptionRepository:
    def __init__(self, db: Database) -> None:
        self.db = db

    def upsert(self, sub_id: str, body: Subscribe) -> None:
        with self.db.connect() as conn:
            conn.execute(
                """INSERT INTO push_subscriptions
                       (id, endpoint, p256dh, auth, client_ref, states, muted, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth,
                       client_ref = excluded.client_ref, states = excluded.states, muted = excluded.muted""",
                (
                    sub_id, body.endpoint, body.keys.p256dh, body.keys.auth, body.client_ref,
                    json.dumps([s.value for s in body.states]), json.dumps(body.muted),
                    datetime.now(UTC).isoformat(),
                ),
            )  # fmt: skip

    def list(self) -> list[StoredSubscription]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM push_subscriptions").fetchall()
        return [
            StoredSubscription(
                id=r["id"],
                client_ref=r["client_ref"],
                states=json.loads(r["states"]),
                muted=json.loads(r["muted"]),
                endpoint=r["endpoint"],
                p256dh=r["p256dh"],
                auth=r["auth"],
            )  # fmt: skip
            for r in rows
        ]

    def delete(self, sub_id: str) -> bool:
        with self.db.connect() as conn:
            return conn.execute("DELETE FROM push_subscriptions WHERE id = ?", (sub_id,)).rowcount > 0
