from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from muxtower.auth.deps import CurrentDevice
from muxtower.auth.routes import Audit
from muxtower.sessions.models import Session

router = APIRouter(prefix="/v1", tags=["recovery"])


class Recovery(BaseModel):
    mode: str = Field(description="ask | auto | off (`[recovery] mode`)")
    sessions: list[Session] = Field(
        description="interrupted by a restart, here and on the nodes: to start again or remove"
    )


class Recover(BaseModel):
    session_ids: list[str] = Field(min_length=1, max_length=200)


@router.get("/recovery")
def interrupted(request: Request, _: CurrentDevice) -> Recovery:
    """The sessions a restart interrupted, waiting to be started again (POST) or removed (DELETE the session)."""
    state = request.app.state
    listed = [s for s in state.directory.list() if s.interrupted_at]
    return Recovery(mode=state.settings.recovery.mode, sessions=listed)


@router.post("/recovery")
def recover(body: Recover, request: Request, device: CurrentDevice, audit: Audit) -> list[Session]:
    """Starts them again, each in its folder with its options, resuming its conversation, under its own id.
    Nothing is sent to them."""
    started: list[Session] = request.app.state.recovery.recover(body.session_ids)
    for session in started:
        audit.record(device.name, "recover", session.id)
    request.app.state.bus.publish("sessions", None)
    return started
