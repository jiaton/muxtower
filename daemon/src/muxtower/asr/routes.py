import asyncio
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request

from muxtower.asr.models import Transcript
from muxtower.asr.service import AUDIO_TYPES, MAX_AUDIO_BYTES, AsrService
from muxtower.auth.deps import CurrentDevice
from muxtower.auth.routes import Audit
from muxtower.errors import Invalid

router = APIRouter(prefix="/v1", tags=["voice"])


def _asr(request: Request) -> AsrService:
    service: AsrService = request.app.state.asr
    return service


@router.post(
    "/asr",
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {kind: {"schema": {"type": "string", "format": "binary"}} for kind in AUDIO_TYPES},
        }
    },
)
async def transcribe(
    request: Request, device: CurrentDevice, asr: Annotated[AsrService, Depends(_asr)], audit: Audit,
    language: str | None = None,
    source: Annotated[str | None, Query(pattern=r"^[a-z0-9-]{1,16}$")] = None,
    hint: Literal["command"] | None = None,
) -> Transcript:  # fmt: skip
    """Speech to text: the body is the recording (WAV from the glasses). `language` (e.g. `zh`, `en`)
    pins the language; without it the provider detects it. `source` names what asked (`live`: the app's
    Live mode), for the audit log's counts. `hint=command`: the recording may be only a spoken command
    (send, pause…): transcribed with a prompt of those words, in the configured language if one is set.
    Nothing is stored."""
    if int(request.headers.get("content-length") or 0) > MAX_AUDIO_BYTES:
        raise Invalid("recording too long")
    audio = bytearray()
    async for chunk in request.stream():  # stops reading at the cap, whatever the headers said
        audio += chunk
        if len(audio) > MAX_AUDIO_BYTES:
            raise Invalid("recording too long")
    transcript = await asyncio.to_thread(
        asr.transcribe, bytes(audio), request.headers.get("content-type", ""), language, hint
    )
    # What was said is never logged.
    await asyncio.to_thread(
        audit.record,
        device.name,
        "asr",
        None,
        f"bytes={len(audio)} chars={len(transcript.text)}" + (f" source={source}" if source else ""),
    )
    return transcript
