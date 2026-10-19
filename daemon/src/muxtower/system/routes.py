from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from muxtower import __version__
from muxtower.auth.deps import CurrentDevice

router = APIRouter(prefix="/v1", tags=["system"])


class Health(BaseModel):
    status: str
    version: str


class Features(BaseModel):
    summaries: bool = Field(description="POST /v1/sessions/{id}/summary can make reply summaries")
    asr: bool = Field(description="POST /v1/asr turns speech into text")


class Me(BaseModel):
    token_name: str
    daemon_name: str
    features: Features


@router.get("/health")
def health() -> Health:
    return Health(status="ok", version=__version__)


@router.get("/me")
def me(request: Request, device: CurrentDevice) -> Me:
    """Lets a client check that its token works and learn the daemon's display name."""
    state = request.app.state
    features = Features(summaries=state.summaries.available, asr=state.asr.available)
    return Me(token_name=device.name, daemon_name=state.daemon_name, features=features)
