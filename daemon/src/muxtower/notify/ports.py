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
