"""GET and PUT /v1/chip-groups: the owner's groups of projects (`service.py`). On a node, asked of its hub."""

from fastapi import APIRouter, Request

from muxtower.auth.deps import CurrentDevice
from muxtower.chips.service import ChipGroups, ChipGroupStore

router = APIRouter(prefix="/v1", tags=["chips"])


def _hubs(request: Request, put: ChipGroups | None) -> ChipGroups | None:
    """The hub's answer, when this daemon is a node (None: it is no node, it keeps them itself)."""
    answered = request.app.state.hub.ask("chip_groups", {"put": put.model_dump() if put else None})
    return None if answered is None else ChipGroups.model_validate(answered)


@router.get("/chip-groups")
def get_chip_groups(request: Request, _: CurrentDevice) -> ChipGroups:
    """The owner's groups of projects, in their order; the same on every device (kept on the hub)."""
    store: ChipGroupStore = request.app.state.chip_groups
    return _hubs(request, None) or store.load()


@router.put("/chip-groups")
def put_chip_groups(body: ChipGroups, request: Request, _: CurrentDevice) -> ChipGroups:
    """Replaces them all with this ordered list (at most 20 groups of 40 projects, names of 40 characters)."""
    store: ChipGroupStore = request.app.state.chip_groups
    answered = _hubs(request, body)
    if answered is not None:
        return answered
    request.app.state.bus.publish("chip-groups", None)
    return store.replace(body)
