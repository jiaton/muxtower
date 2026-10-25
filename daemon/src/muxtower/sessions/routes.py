import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Request

from muxtower.approval.models import ApprovalResult, Approve
from muxtower.auth.deps import CurrentDevice
from muxtower.auth.routes import Audit
from muxtower.runtimes.models import RuntimeInfo
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.models import Conversation, CreateSession, MarkRead, Session, UpdateSession
from muxtower.sessions.service import SessionService
from muxtower.terminal.models import Resize, Screen, SendInput

router = APIRouter(prefix="/v1", tags=["sessions"])


def _sessions(request: Request) -> SessionService:
    service: SessionService = request.app.state.sessions
    return service


def _directory(request: Request) -> SessionDirectory:
    directory: SessionDirectory = request.app.state.directory
    return directory


Sessions = Annotated[SessionService, Depends(_sessions)]
Directory = Annotated[SessionDirectory, Depends(_directory)]


@router.get("/runtimes")
def list_runtimes(_: CurrentDevice, sessions: Sessions) -> list[RuntimeInfo]:
    import shutil

    return [
        RuntimeInfo(
            name=rt.name,
            binary=rt.config.binary,
            available=shutil.which(rt.config.binary) is not None,
            has_hooks=rt.config.hooks is not None,
        )
        for rt in sessions.runtimes.values()
    ]


@router.get("/sessions")
def list_sessions(_: CurrentDevice, directory: Directory) -> list[Session]:
    return directory.list()


@router.post("/sessions", status_code=201)
async def create_session(body: CreateSession, device: CurrentDevice, sessions: Sessions, audit: Audit) -> Session:
    session = await asyncio.to_thread(sessions.create, body)
    audit.record(device.name, "create", session.id, f"runtime={session.runtime} cwd={session.cwd}")
    return session


@router.get("/sessions/{session_id}")
def get_session(session_id: str, _: CurrentDevice, directory: Directory) -> Session:
    return directory.get(session_id)


@router.get("/sessions/{session_id}/conversation")
def get_conversation(
    session_id: str, _: CurrentDevice, directory: Directory, after: int = 0, limit: int = 100
) -> Conversation:
    """Structured conversation items after `after` (0 = the latest `limit`). Only for sessions whose
    capabilities include `conversation`; others have a screen instead."""
    return directory.conversation(session_id, after, max(1, min(limit, 400)))


@router.patch("/sessions/{session_id}")
def update_session(
    session_id: str, body: UpdateSession, device: CurrentDevice, directory: Directory, audit: Audit
) -> Session:
    session = directory.update(session_id, body)
    audit.record(device.name, "update", session_id, body.model_dump_json(exclude_none=True))
    return session


@router.post("/sessions/{session_id}/read", status_code=204)
def mark_read(session_id: str, body: MarkRead, request: Request, _: CurrentDevice, directory: Directory) -> None:
    """A client looks at the session (sent on opening and every few seconds while open), or the owner marks
    it unread to come back to."""
    directory.mark_read(session_id, body.read)
    request.app.state.bus.publish("sessions", None)


@router.delete("/sessions/{session_id}", status_code=204)
def terminate_session(session_id: str, device: CurrentDevice, directory: Directory, audit: Audit) -> None:
    directory.terminate(session_id)
    audit.record(device.name, "terminate", session_id)


@router.get("/sessions/{session_id}/screen")
def get_screen(session_id: str, _: CurrentDevice, directory: Directory, history: int = 200) -> Screen:
    return directory.screen(session_id, history)


@router.post("/sessions/{session_id}/input", status_code=204)
def send_input(session_id: str, body: SendInput, device: CurrentDevice, directory: Directory, audit: Audit) -> None:
    directory.send_input(session_id, body)
    # The typed text itself is never logged.
    what = f"key={body.key}" if body.key else f"text chars={len(body.text or '')} enter={body.enter}"
    audit.record(device.name, "input", session_id, what)


@router.post("/sessions/{session_id}/resize", status_code=204)
def resize(session_id: str, body: Resize, _: CurrentDevice, directory: Directory) -> None:
    directory.resize(session_id, body)


@router.post("/sessions/{session_id}/resize/release", status_code=204)
def release_size(session_id: str, _: CurrentDevice, directory: Directory) -> None:
    directory.release_size(session_id)


@router.post("/sessions/{session_id}/approve")
def approve(
    session_id: str, body: Approve, device: CurrentDevice, directory: Directory, audit: Audit
) -> ApprovalResult:
    result = directory.approve(session_id, body.option)
    audit.record(device.name, "approve", session_id, f"state={result.state} option={result.option}")
    return result


@router.post("/sessions/{session_id}/deny")
def deny(session_id: str, device: CurrentDevice, directory: Directory, audit: Audit) -> ApprovalResult:
    result = directory.deny(session_id)
    audit.record(device.name, "deny", session_id, f"state={result.state}")
    return result
