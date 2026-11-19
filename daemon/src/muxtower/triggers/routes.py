"""Triggers (`models.py`): kept and edited by the owner's devices; fired by their secret (a webhook) or by
the owner's own scripts through `muxtower trigger` (a device's token, this machine's CLI). Kept on the hub: on
a node, the list and `muxtower trigger` are asked of it (`answer`, through `nodes/asked.py`)."""

import json
from typing import Annotated, Any

from fastapi import APIRouter, Header, Request

from muxtower.auth.deps import CurrentDevice
from muxtower.auth.routes import Audit
from muxtower.errors import Invalid, NotFound
from muxtower.infra.audit import AuditLog
from muxtower.triggers.models import (
    MAX_BODY,
    SECRET_HEADER,
    FireByName,
    Firing,
    TestFire,
    Trigger,
    TriggerCreated,
    TriggerPatch,
    TriggerSecret,
    TriggerSpec,
)  # fmt: skip
from muxtower.triggers.service import TriggerService
from muxtower.triggers.store import TriggerStore

router = APIRouter(prefix="/v1", tags=["triggers"])


def _store(request: Request) -> TriggerStore:
    store: TriggerStore = request.app.state.triggers
    return store


def _service(request: Request) -> TriggerService:
    service: TriggerService = request.app.state.trigger_service
    return service


# On the hub, a node's request takes this long at most: a start may wait on another machine.
HUB_ASK_SECONDS = 60.0


def _hubs(request: Request, params: dict[str, Any]) -> Any:
    """The hub's answer when this daemon is a node; None when it keeps the triggers itself."""
    return request.app.state.hub.ask("triggers", params, HUB_ASK_SECONDS)


def _fire_by_name(store: TriggerStore, service: TriggerService, body: FireByName) -> tuple[Trigger, Firing]:
    trigger = store.by_name(body.name)
    size = len(json.dumps(body.payload).encode())
    if size > MAX_BODY:
        raise Invalid(f"an event carries at most {MAX_BODY // 1024} KB")
    return trigger, service.fire(trigger, body.payload, body.key, "cli", size)


def answer(store: TriggerStore, service: TriggerService, audit: AuditLog, params: dict[str, Any], node: str) -> Any:
    """A node's request (`nodes/asked.py`), as JSON: its list, or `muxtower trigger` run there."""
    op = params.get("op")
    if op == "list":
        return [t.model_dump(mode="json") for t in store.all()]
    if op == "fire":
        trigger, firing = _fire_by_name(store, service, FireByName.model_validate(params.get("body")))
        audit.record(f"{node}: cli", "trigger_fire", trigger.id, f"cli {firing.outcome}")
        return firing.model_dump(mode="json")
    raise Invalid(f"unknown triggers request {op}")


@router.get("/triggers")
def list_triggers(request: Request, _: CurrentDevice) -> list[Trigger]:
    """Every trigger (on a node: its hub's)."""
    answered = _hubs(request, {"op": "list"})
    if answered is not None:
        return [Trigger.model_validate(t) for t in answered]
    return _store(request).all()


@router.post("/triggers", status_code=201)
def create_trigger(body: TriggerSpec, request: Request, device: CurrentDevice, audit: Audit) -> TriggerCreated:
    """A new trigger, and its secret, shown this once."""
    trigger, secret = _store(request).create(body)
    audit.record(device.name, "trigger_create", trigger.id, trigger.name)
    return TriggerCreated(trigger=trigger, secret=secret)


@router.get("/triggers/{trigger_id}")
def get_trigger(trigger_id: str, request: Request, _: CurrentDevice) -> Trigger:
    return _store(request).get(trigger_id)


@router.patch("/triggers/{trigger_id}")
def update_trigger(
    trigger_id: str, body: TriggerPatch, request: Request, device: CurrentDevice, audit: Audit
) -> Trigger:
    trigger = _store(request).update(trigger_id, body)
    audit.record(device.name, "trigger_update", trigger_id, trigger.name)
    return trigger


@router.delete("/triggers/{trigger_id}", status_code=204)
def delete_trigger(trigger_id: str, request: Request, device: CurrentDevice, audit: Audit) -> None:
    _store(request).delete(trigger_id)
    audit.record(device.name, "trigger_delete", trigger_id, "")


@router.post("/triggers/{trigger_id}/secret")
def rotate_secret(trigger_id: str, request: Request, device: CurrentDevice, audit: Audit) -> TriggerSecret:
    """A new secret, shown this once; the old one no longer fires it."""
    secret = _store(request).rotate(trigger_id)
    audit.record(device.name, "trigger_secret", trigger_id, "rotated")
    return TriggerSecret(secret=secret)


@router.get("/triggers/{trigger_id}/firings")
def trigger_firings(trigger_id: str, request: Request, _: CurrentDevice) -> list[Firing]:
    """Its last firings, newest first, whatever became of each."""
    return _store(request).firings(trigger_id)


@router.post("/triggers/{trigger_id}/test")
def test_trigger(trigger_id: str, body: TestFire, request: Request, device: CurrentDevice, audit: Audit) -> Firing:
    """Fires it with a sample payload, through all its rules and its action (logged as a test)."""
    trigger = _store(request).get(trigger_id)
    size = len(json.dumps(body.payload).encode())
    firing = _service(request).fire(trigger, body.payload, body.key, "test", size)
    audit.record(device.name, "trigger_fire", trigger_id, f"test {firing.outcome}")
    return firing


@router.post("/triggers/fire-by-name")
def fire_by_name(body: FireByName, request: Request, device: CurrentDevice, audit: Audit) -> Firing:
    """`muxtower trigger <name>`: the owner's own script (a device's token: this machine's CLI). On a node,
    fired by its hub, which keeps the triggers."""
    answered = _hubs(request, {"op": "fire", "body": body.model_dump(mode="json")})
    if answered is not None:
        return Firing.model_validate(answered)
    trigger, firing = _fire_by_name(_store(request), _service(request), body)
    audit.record(device.name, "trigger_fire", trigger.id, f"cli {firing.outcome}")
    return firing


async def _fire(request: Request, trigger_id: str, secret: str | None, key: str | None) -> Firing:
    store = _store(request)
    if not secret or not store.secret_matches(trigger_id, secret):
        raise NotFound("no such trigger")  # a wrong secret is told nothing more
    raw = await request.body()
    if len(raw) > MAX_BODY:
        raise Invalid(f"an event carries at most {MAX_BODY // 1024} KB")
    payload: Any
    try:
        payload = json.loads(raw) if raw else None
    except ValueError:
        payload = raw.decode(errors="replace")  # plain text: taken as it is
    trigger = store.get(trigger_id)
    firing = _service(request).fire(trigger, payload, key, "webhook", len(raw))
    request.app.state.audit.record("webhook", "trigger_fire", trigger_id, f"webhook {firing.outcome}")
    return firing


@router.post(
    "/triggers/{trigger_id}/fire",
    responses={404: {"description": "no such trigger, or not its secret"}},
    openapi_extra={"requestBody": {"content": {"application/json": {"schema": {}}, "text/plain": {"schema": {}}}}},
)
async def fire(
    trigger_id: str,
    request: Request,
    secret: Annotated[str | None, Header(alias=SECRET_HEADER)] = None,
    key: str | None = None,
) -> Firing:
    """An event from outside (a webhook): JSON or text, at most 64 KB; `?key=` for its dedupe key. Fired by
    the trigger's secret (the header), never by a device's token."""
    return await _fire(request, trigger_id, secret, key)


@router.post(
    "/triggers/{trigger_id}/fire/{secret}", responses={404: {"description": "no such trigger, or not its secret"}}
)
async def fire_with_path_secret(trigger_id: str, secret: str, request: Request, key: str | None = None) -> Firing:
    """For a sender that cannot set a header: the secret in the path (it shows in proxy logs; prefer the
    header)."""
    return await _fire(request, trigger_id, secret, key)
