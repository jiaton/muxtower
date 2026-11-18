from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, Field

from muxtower.auth.deps import CurrentDevice
from muxtower.tts.service import MAX_TEXT, TtsService, TtsStatus

router = APIRouter(prefix="/v1", tags=["tts"])


class Say(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT)
    voice: str | None = Field(default=None, description="another voice than the set one (Settings' Preview)")
    style: str | None = None


@router.get("/tts")
def tts_status(request: Request, _: CurrentDevice) -> TtsStatus:
    """Whether Read aloud speaks in the hub's voice now, and why not; this month's characters."""
    service: TtsService = request.app.state.tts
    return service.status()


@router.post("/tts", response_class=Response, responses={200: {"content": {"audio/mpeg": {}}}})
def tts_say(body: Say, request: Request, _: CurrentDevice) -> Response:
    """The text said in the hub's voice, mp3; 503 says why not (off, key, cap, quota, timeout, failed):
    the phone then speaks it itself."""
    service: TtsService = request.app.state.tts
    audio = service.speak(body.text, body.voice, body.style)
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=86400"})
