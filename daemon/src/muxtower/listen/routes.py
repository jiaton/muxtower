from fastapi import APIRouter, Query, Request

from muxtower.auth.deps import CurrentDevice
from muxtower.errors import Conflict, NotFound
from muxtower.listen.service import ListenService, Spoken

router = APIRouter(prefix="/v1", tags=["listen"])


@router.get("/sessions/{session_id}/spoken")
def spoken(
    session_id: str, request: Request, _: CurrentDevice, last: int = Query(default=5, ge=1, le=5)
) -> list[Spoken]:
    """The session's last spoken summaries (Live's Read aloud), the latest last: those made while it was
    listened to, even with the phone away."""
    listen: ListenService = request.app.state.listen
    return listen.kept(session_id, last)


@router.post("/sessions/{session_id}/spoken")
def speak_latest(session_id: str, request: Request, _: CurrentDevice) -> Spoken:
    """The spoken summary of the session's latest reply, made now when there is none (Play): one summarizer
    call, counted against `listen.max_per_day`. 409 says why not."""
    listen: ListenService = request.app.state.listen
    found = listen.latest(session_id)
    if found is None:
        raise NotFound("this session has no reply to say")
    if not isinstance(found, Spoken):
        raise Conflict(found.error or "no summary")
    return found
