from fastapi import APIRouter, Request
from pydantic import BaseModel

from muxtower import __version__
from muxtower.auth.deps import CurrentDevice

router = APIRouter(prefix="/v1", tags=["system"])


class Health(BaseModel):
    status: str
    version: str


class Me(BaseModel):
    token_name: str
    daemon_name: str


@router.get("/health")
def health() -> Health:
    return Health(status="ok", version=__version__)


@router.get("/me")
def me(request: Request, device: CurrentDevice) -> Me:
    """Lets a client check that its token works and learn the daemon's display name."""
    return Me(token_name=device.name, daemon_name=request.app.state.daemon_name)
