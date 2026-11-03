from fastapi import APIRouter, Request

from muxtower.auth.deps import CurrentDevice
from muxtower.usage.models import MachineUsage

router = APIRouter(prefix="/v1", tags=["usage"])


@router.get("/usage")
def usage(request: Request, _: CurrentDevice) -> list[MachineUsage]:
    """What the daemon on each machine uses: this one first, then each node joined to it (as it last said),
    with what is over its threshold (`alerts`). Sampled every few seconds; asking costs nothing."""
    state = request.app.state
    mine: MachineUsage = state.usage.current
    return [mine, *state.nodes.usages()]
