"""The owner's Inbox (`models.py`), for the app: list, add, edit, delete, reorder, hand an item to a session
(one team task), and each project's default hand-off role and who an item can go to. Kept on the hub: on a
node, every call is asked of it (`answer`, through `nodes/asked.py`)."""

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from muxtower.auth.deps import CurrentDevice
from muxtower.errors import Unavailable
from muxtower.inbox.models import (
    HandInboxItem,
    Handoff,
    HandoffTargets,
    Inbox,
    InboxConflict,
    InboxItem,
    InboxOrder,
    InboxPatch,
    NewInboxItem,
)  # fmt: skip

router = APIRouter(prefix="/v1", tags=["inbox"])

STALE: dict[int | str, dict[str, Any]] = {
    409: {"model": InboxConflict, "description": "if_version is stale: the item as it is now"}
}


def answer(service: Any, params: dict[str, Any], actor: str) -> Any:
    """An Inbox request, as JSON: a device's here, or one a node passed on (`nodes/asked.py`)."""
    raise Unavailable("the Inbox is not built yet")


def _do(request: Request, actor: str, op: str, **params: Any) -> Any:
    answered = request.app.state.hub.ask("inbox", {"op": op, **params})
    if answered is not None:
        return answered
    return answer(getattr(request.app.state, "inbox", None), {"op": op, **params}, actor)


@router.get("/inbox")
def get_inbox(request: Request, device: CurrentDevice, done: bool = False) -> Inbox:
    """Open and handed items, in the owner's order; `?done=1` adds the done ones of the last 30 days."""
    return Inbox.model_validate(_do(request, device.name, "list", done=done))


@router.post("/inbox", status_code=201)
def add_inbox_item(body: NewInboxItem, request: Request, device: CurrentDevice) -> InboxItem:
    """A new open item, first in the list."""
    return InboxItem.model_validate(_do(request, device.name, "add", body=body.model_dump()))


@router.patch("/inbox/{item_id}", response_model=InboxItem, responses=STALE)
def patch_inbox_item(item_id: int, body: InboxPatch, request: Request, device: CurrentDevice) -> Any:
    """Changes its text, project (null: none) or status (open, done), if it is still at `if_version`."""
    patch = body.model_dump(exclude_unset=True)
    answered = _do(request, device.name, "patch", id=item_id, body=patch)
    if "stale" in answered:
        conflict = InboxConflict.model_validate(answered["stale"])
        return JSONResponse(status_code=409, content=conflict.model_dump(mode="json"))
    return InboxItem.model_validate(answered["item"])


@router.delete("/inbox/{item_id}", status_code=204)
def delete_inbox_item(item_id: int, request: Request, device: CurrentDevice) -> None:
    """Deletes it, from the list or the history, without a trace."""
    _do(request, device.name, "delete", id=item_id)


@router.put("/inbox/order")
def put_inbox_order(body: InboxOrder, request: Request, device: CurrentDevice) -> Inbox:
    """The owner's order: these ids first to last, any others after them as they were."""
    return Inbox.model_validate(_do(request, device.name, "order", body=body.model_dump()))


@router.post(
    "/inbox/{item_id}/hand",
    responses={409: {"description": "no one in the project holds the role, several do, or it is done"}},
)
def hand_inbox_item(item_id: int, body: HandInboxItem, request: Request, device: CurrentDevice) -> InboxItem:
    """Sends it as one team task to whoever holds `role` in `project` (without regard to case), or to
    `session_id`; it becomes handed, with the task's id."""
    return InboxItem.model_validate(_do(request, device.name, "hand", id=item_id, body=body.model_dump()))


@router.get("/projects/{project:path}/handoff-targets")
def handoff_targets(project: str, request: Request, device: CurrentDevice) -> HandoffTargets:
    """Who an item of this project can be handed to: its live sessions' roles (with how many hold each), its
    live sessions, and its default hand-off role. A project with no sessions: empty lists."""
    return HandoffTargets.model_validate(_do(request, device.name, "targets", project=project))


@router.get("/projects/{project:path}/handoff")
def get_handoff(project: str, request: Request, device: CurrentDevice) -> Handoff:
    """The project's default hand-off role (null: none)."""
    return Handoff.model_validate(_do(request, device.name, "get_handoff", project=project))


@router.put("/projects/{project:path}/handoff")
def put_handoff(project: str, body: Handoff, request: Request, device: CurrentDevice) -> Handoff:
    """Sets it (free text; null or blank: none). It follows the project when it is renamed."""
    return Handoff.model_validate(_do(request, device.name, "put_handoff", project=project, body=body.model_dump()))
