from typing import Protocol

from muxtower.notify.models import Subscribe, Subscription


class StoredSubscription(Subscription):
    endpoint: str
    p256dh: str
    auth: str
    device: str | None = None  # the paired device that registered it


class SubscriptionRepository(Protocol):
    def upsert(self, sub_id: str, body: Subscribe, device: str) -> None: ...
    def list(self) -> list[StoredSubscription]: ...
    def delete(self, sub_id: str) -> bool: ...


class PushSender(Protocol):
    def send(self, sub: StoredSubscription, payload: str) -> bool:
        """False when the push service says the subscription is gone."""
        ...


class ShownStore(Protocol):
    """Where the notifications out there are kept over a restart (`PushService`)."""

    def load(self) -> tuple[dict[str, float], dict[str, dict[str, float]]]: ...
    def save(self, notified: dict[str, float], shown: dict[str, dict[str, float]]) -> None: ...
