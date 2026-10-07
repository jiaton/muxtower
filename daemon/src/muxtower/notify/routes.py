from typing import Annotated

from fastapi import APIRouter, Depends, Request

from muxtower.auth.deps import CurrentDevice
from muxtower.errors import NotFound
from muxtower.notify.models import Subscribe, Subscription, VapidKey
from muxtower.notify.service import PushService

router = APIRouter(prefix="/v1/push", tags=["push"])


def _push(request: Request) -> PushService:
    service: PushService = request.app.state.push
    return service


Push = Annotated[PushService, Depends(_push)]


@router.get("/key")
def vapid_key(_: CurrentDevice, push: Push) -> VapidKey:
    return VapidKey(public_key=push.sender.public_key)  # type: ignore[attr-defined]


@router.post("/subscriptions")
def subscribe(body: Subscribe, _: CurrentDevice, push: Push) -> Subscription:
    return push.subscribe(body)


@router.delete("/subscriptions/{subscription_id}", status_code=204)
def unsubscribe(subscription_id: str, _: CurrentDevice, push: Push) -> None:
    if not push.unsubscribe(subscription_id):
        raise NotFound("no such subscription")
