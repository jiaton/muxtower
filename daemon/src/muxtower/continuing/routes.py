import asyncio

from fastapi import APIRouter, Request

from muxtower.auth.deps import CurrentDevice
from muxtower.continuing.models import Continuation
from muxtower.continuing.service import Continuer

router = APIRouter(prefix="/v1", tags=["sessions"])


def _continuer(request: Request) -> Continuer:
    service: Continuer = request.app.state.continuer
    return service


@router.get("/sessions/{session_id}/continue")
async def continue_check(session_id: str, request: Request, _: CurrentDevice) -> Continuation:
    """Whether this Remote Control session (the Claude app's, claude.ai's) can be continued in a terminal, and
    if not why (`blocked`); while it is, how far it got (`closing`, `starting`), and how it ended (`done`,
    `failed`)."""
    return await asyncio.to_thread(_continuer(request).check, session_id)


@router.post("/sessions/{session_id}/continue")
async def continue_in_terminal(session_id: str, request: Request, device: CurrentDevice) -> Continuation:
    """Continue in terminal: archives it on the Claude account (it leaves the Claude apps), reads that back,
    then resumes its conversation in a muxtower pane on the machine it ran on, in its folder; the Remote Control
    entry becomes that pane session (`session_id`), with its name, project, role, note, chips and read state.
    Nothing is started unless it was closed there. A second call while it runs, or after, does nothing again;
    after a pane that did not start (`failed`, `retry`), it starts the pane again. 409: it cannot be
    continued (said why), and nothing was done."""
    service = _continuer(request)
    result = await asyncio.to_thread(service.run, session_id, device.name)
    request.app.state.bus.publish("sessions", None)
    return result
