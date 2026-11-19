"""Firing a trigger: paused? → filter → dedupe → rate → its action → logged and audited.

The contract's placeholder: every firing is logged as failed, "not built yet". (Triggers v1, task T1.)"""

from datetime import UTC, datetime
from typing import Any

from muxtower.triggers.models import Firing, Trigger, Via
from muxtower.triggers.store import TriggerStore


class TriggerService:
    def __init__(self, store: TriggerStore) -> None:
        self.store = store

    def fire(self, trigger: Trigger, payload: Any, key: str | None, via: Via, size: int) -> Firing:
        """Blocking. What became of one event."""
        firing = Firing(
            id=0, trigger_id=trigger.id, at=datetime.now(UTC), via=via, key=key, outcome="failed",
            detail="firing is not built yet", bytes=size,
        )  # fmt: skip
        return self.store.record(firing)
