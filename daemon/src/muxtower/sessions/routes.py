import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Request

from muxtower.approval.models import ApprovalResult, Approve
from muxtower.approval.service import ApprovalService
from muxtower.auth.deps import CurrentDevice
from muxtower.auth.routes import Audit
from muxtower.runtimes.models import RuntimeInfo
from muxtower.sessions.models import CreateSession, Session, UpdateSession
from muxtower.sessions.service import SessionService
from muxtower.terminal.models import Resize, Screen, SendInput
from muxtower.terminal.service import TerminalService

router = APIRouter(prefix="/v1", tags=["sessions"])


def _sessions(request: Request) -> SessionService:
    service: SessionService = request.app.state.sessions
    return service


def _terminal(request: Request) -> TerminalService:
    service: TerminalService = request.app.state.terminal
    return service


def _approvals(request: Request) -> ApprovalService:
    service: ApprovalService = request.app.state.approvals
    return service


Sessions = Annotated[SessionService, Depends(_sessions)]
Terminal = Annotated[TerminalService, Depends(_terminal)]
Approvals = Annotated[ApprovalService, Depends(_approvals)]


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
def list_sessions(_: CurrentDevice, sessions: Sessions) -> list[Session]:
    return sessions.list()


@router.post("/sessions", status_code=201)
async def create_session(body: CreateSession, device: CurrentDevice, sessions: Sessions, audit: Audit) -> Session:
    session = await asyncio.to_thread(sessions.create, body)
    audit.record(device.name, "create", session.id, f"runtime={session.runtime} cwd={session.cwd}")
    return session


@router.get("/sessions/{session_id}")
def get_session(session_id: str, _: CurrentDevice, sessions: Sessions) -> Session:
    return sessions.get(session_id)


@router.patch("/sessions/{session_id}")
def update_session(
    session_id: str, body: UpdateSession, device: CurrentDevice, sessions: Sessions, audit: Audit
) -> Session:
    session = sessions.update(session_id, body)
    audit.record(device.name, "update", session_id, body.model_dump_json(exclude_none=True))
    return session


@router.delete("/sessions/{session_id}", status_code=204)
def terminate_session(session_id: str, device: CurrentDevice, sessions: Sessions, audit: Audit) -> None:
    sessions.terminate(session_id)
    audit.record(device.name, "terminate", session_id)


@router.get("/sessions/{session_id}/screen")
def get_screen(session_id: str, _: CurrentDevice, terminal: Terminal, history: int = 200) -> Screen:
    return terminal.screen(session_id, history)


@router.post("/sessions/{session_id}/input", status_code=204)
def send_input(session_id: str, body: SendInput, device: CurrentDevice, terminal: Terminal, audit: Audit) -> None:
    terminal.send(session_id, body)
    # The typed text itself is never logged.
    what = f"key={body.key}" if body.key else f"text chars={len(body.text or '')} enter={body.enter}"
    audit.record(device.name, "input", session_id, what)


@router.post("/sessions/{session_id}/resize", status_code=204)
def resize(session_id: str, body: Resize, _: CurrentDevice, terminal: Terminal) -> None:
    terminal.resize(session_id, body)


@router.post("/sessions/{session_id}/resize/release", status_code=204)
def release_size(session_id: str, _: CurrentDevice, terminal: Terminal) -> None:
    terminal.release(session_id)


@router.post("/sessions/{session_id}/approve")
def approve(
    session_id: str, body: Approve, device: CurrentDevice, approvals: Approvals, audit: Audit
) -> ApprovalResult:
    result = approvals.approve(session_id, body.option)
    audit.record(device.name, "approve", session_id, f"state={result.state} option={result.option}")
    return result


@router.post("/sessions/{session_id}/deny")
def deny(session_id: str, device: CurrentDevice, approvals: Approvals, audit: Audit) -> ApprovalResult:
    result = approvals.deny(session_id)
    audit.record(device.name, "deny", session_id, f"state={result.state}")
    return result
