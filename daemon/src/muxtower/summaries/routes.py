import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Request

from muxtower.auth.deps import CurrentDevice
from muxtower.sessions.directory import SessionDirectory
from muxtower.summaries.models import SummaryStatus
from muxtower.summaries.service import SummaryService

router = APIRouter(prefix="/v1", tags=["sessions"])


def _summaries(request: Request) -> SummaryService:
    service: SummaryService = request.app.state.summaries
    return service


def _directory(request: Request) -> SessionDirectory:
    directory: SessionDirectory = request.app.state.directory
    return directory


@router.post("/sessions/{session_id}/summary")
async def request_summary(
    session_id: str,
    _: CurrentDevice,
    summaries: Annotated[SummaryService, Depends(_summaries)],
    directory: Annotated[SessionDirectory, Depends(_directory)],
) -> SummaryStatus:
    """Asks for a short version of the session's last reply. `pending` means it is being made: the session
    list is pushed again once `reply_summary` is filled in."""
    session = await asyncio.to_thread(directory.get, session_id)
    return SummaryStatus(state=summaries.request(session.last_message))
