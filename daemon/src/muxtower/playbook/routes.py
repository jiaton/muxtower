"""The owner's team playbook (`service.py`): read, saved as a new version, its history, a revert. On a
node, asked of its hub, which keeps it."""

from typing import Any

from fastapi import APIRouter, Request

from muxtower.auth.deps import CurrentDevice
from muxtower.playbook.service import Playbook, PlaybookPart, PlaybookStore, PlaybookVersion, PutPlaybook, Revert

router = APIRouter(prefix="/v1", tags=["playbook"])


def _hubs(request: Request, op: str, **params: Any) -> Any:
    """The hub's answer when this daemon is a node; None when it keeps the playbook itself."""
    return request.app.state.hub.ask("playbook", {"op": op, **params})


def answer(store: PlaybookStore, params: dict[str, Any], author: str) -> Any:
    """A playbook request, as JSON: a device's here, or one a node passed on (`nodes/asked.py`)."""
    op, scope = params.get("op"), str(params.get("scope") or "")
    if op == "get":
        return store.get(params.get("effective_for")).model_dump(mode="json")
    if op == "put":
        return store.put(scope, PutPlaybook.model_validate(params.get("body")), author).model_dump(mode="json")
    if op == "versions":
        return [v.model_dump(mode="json") for v in store.versions(scope)]
    if op == "revert":
        return store.revert(scope, Revert.model_validate(params.get("body")).version, author).model_dump(mode="json")
    raise ValueError(f"unknown playbook request {op}")


def _do(request: Request, author: str, op: str, **params: Any) -> Any:
    answered = _hubs(request, op, **params)
    if answered is not None:
        return answered
    found = answer(request.app.state.playbook, {"op": op, **params}, author)
    if op in ("put", "revert"):
        request.app.state.bus.publish("playbook", None)
    return found


@router.get("/playbook")
def get_playbook(request: Request, _: CurrentDevice, effective_for: str | None = None) -> Playbook:
    """The shared playbook, the projects that add to it or replace it, and (`effective_for` a project; empty:
    a session of none) what a session of it reads."""
    return Playbook.model_validate(_do(request, "", "get", effective_for=effective_for))


@router.get("/playbook/{scope:path}/versions")
def playbook_versions(scope: str, request: Request, _: CurrentDevice) -> list[PlaybookVersion]:
    """Every version of one playbook (`shared` or `projects/<project>`), newest first."""
    return [PlaybookVersion.model_validate(v) for v in _do(request, "", "versions", scope=scope)]


@router.post("/playbook/{scope:path}/revert")
def revert_playbook(scope: str, body: Revert, request: Request, device: CurrentDevice) -> PlaybookPart:
    """Saves an earlier version again, as the newest."""
    return PlaybookPart.model_validate(_do(request, device.name, "revert", scope=scope, body=body.model_dump()))


@router.put("/playbook/{scope:path}")
def put_playbook(scope: str, body: PutPlaybook, request: Request, device: CurrentDevice) -> PlaybookPart:
    """Saves a new version of one playbook (`shared` or `projects/<project>`); 409 when another was saved
    since `base_version`."""
    return PlaybookPart.model_validate(_do(request, device.name, "put", scope=scope, body=body.model_dump()))
