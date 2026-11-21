"""GET and PUT /v1/chip-groups: the owner's groups of projects (`service.py`); GET and PUT /v1/project-order: their
order of projects in the list (`project_order.py`); GET and PUT /v1/project-colours: each project's colour
(`project_colours.py`). On a node, all asked of its hub."""

from fastapi import APIRouter, Request

from muxtower.auth.deps import CurrentDevice
from muxtower.auth.routes import Audit
from muxtower.chips.project_colours import ProjectColour, ProjectColours, ProjectColourStore
from muxtower.chips.project_order import ProjectOrder, ProjectOrderStore
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
    """Replaces them all with this ordered list (at most 20 groups of 40 projects and 100 sessions, names of
    40 characters)."""
    store: ChipGroupStore = request.app.state.chip_groups
    answered = _hubs(request, body)
    if answered is not None:
        return answered
    request.app.state.bus.publish("chip-groups", None)
    return store.replace(body)


def _hubs_order(request: Request, put: ProjectOrder | None) -> ProjectOrder | None:
    """The hub's order, when this daemon is a node (None: it keeps it itself)."""
    answered = request.app.state.hub.ask("project_order", {"put": put.model_dump() if put else None})
    return None if answered is None else ProjectOrder.model_validate(answered)


@router.get("/project-order")
def get_project_order(request: Request, _: CurrentDevice) -> ProjectOrder:
    """The owner's order of projects in the list grouped by project; the same on every device (kept on the hub)."""
    store: ProjectOrderStore = request.app.state.project_order
    return _hubs_order(request, None) or store.load()


@router.put("/project-order")
def put_project_order(body: ProjectOrder, request: Request, _: CurrentDevice) -> ProjectOrder:
    """Replaces it with this list of project names, first to last (at most 500, each of 200 characters)."""
    store: ProjectOrderStore = request.app.state.project_order
    answered = _hubs_order(request, body)
    if answered is not None:
        return answered
    request.app.state.bus.publish("project-order", None)
    return store.replace(body)


def _hubs_colours(request: Request, put: ProjectColour | None) -> ProjectColours | None:
    """The hub's colours, when this daemon is a node (None: it keeps them itself)."""
    answered = request.app.state.hub.ask("project_colours", {"put": put.model_dump() if put else None})
    return None if answered is None else ProjectColours.model_validate(answered)


@router.get("/project-colours")
def get_project_colours(request: Request, _: CurrentDevice) -> ProjectColours:
    """Each project's colour, one of 6 hues; the same on every device (kept on the hub, which gives a project
    its hue the first time it lists one of its sessions). A project not here has none yet."""
    store: ProjectColourStore = request.app.state.project_colours
    return _hubs_colours(request, None) or store.load()


@router.put("/project-colours")
def put_project_colour(body: ProjectColour, request: Request, device: CurrentDevice, audit: Audit) -> ProjectColours:
    """Gives a project the hue the owner picked (1 to 6), kept from now on; answers every project's."""
    store: ProjectColourStore = request.app.state.project_colours
    answered = _hubs_colours(request, body)
    audit.record(device.name, "project-colour", detail=f"{body.project}={body.hue}")
    if answered is not None:
        return answered
    request.app.state.bus.publish("project-colours", None)
    return store.choose(body)
