import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Request

from muxtower.approval.models import ApprovalResult, Approve
from muxtower.approval.service import ApprovalService
from muxtower.auth.deps import CurrentDevice
from muxtower.auth.routes import Audit
from muxtower.errors import Conflict
from muxtower.runtimes.models import RuntimeInfo
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.models import Conversation, CreateSession, Session, UpdateSession
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


def _directory(request: Request) -> SessionDirectory:
    directory: SessionDirectory = request.app.state.directory
    return directory


Sessions = Annotated[SessionService, Depends(_sessions)]
Directory = Annotated[SessionDirectory, Depends(_directory)]
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
    remote = directory.remote_for(session_id)
    if remote is None:
        directory.get(session_id)  # 404 for unknown ids
        raise Conflict("this session has no structured conversation; use its screen")
    return remote.conversation(session_id, after, max(1, min(limit, 400)))


def _local_only(directory: SessionDirectory, session_id: str, what: str) -> None:
    if directory.remote_for(session_id) is not None:
        raise Conflict(f"{what} is not available for this session")


@router.patch("/sessions/{session_id}")
def update_session(
    session_id: str, body: UpdateSession, device: CurrentDevice, sessions: Sessions, directory: Directory,
    audit: Audit,
) -> Session:  # fmt: skip
    _local_only(directory, session_id, "renaming or auto-approve")
    session = sessions.update(session_id, body)
    audit.record(device.name, "update", session_id, body.model_dump_json(exclude_none=True))
    return session


@router.delete("/sessions/{session_id}", status_code=204)
def terminate_session(
    session_id: str, device: CurrentDevice, sessions: Sessions, directory: Directory, audit: Audit
) -> None:
    _local_only(directory, session_id, "stopping")
    sessions.terminate(session_id)
    audit.record(device.name, "terminate", session_id)


@router.get("/sessions/{session_id}/screen")
def get_screen(
    session_id: str, _: CurrentDevice, terminal: Terminal, directory: Directory, history: int = 200
) -> Screen:
    _local_only(directory, session_id, "a terminal screen")
    return terminal.screen(session_id, history)


@router.post("/sessions/{session_id}/input", status_code=204)
def send_input(
    session_id: str, body: SendInput, device: CurrentDevice, terminal: Terminal, directory: Directory,
    audit: Audit,
) -> None:  # fmt: skip
    remote = directory.remote_for(session_id)
    if remote is not None:
        if body.text is not None:
            remote.send_text(session_id, body.text)  # a message is sent whole; `enter` is implied
        elif body.key is not None:
            remote.send_key(session_id, body.key)
    else:
        terminal.send(session_id, body)
    # The typed text itself is never logged.
    what = f"key={body.key}" if body.key else f"text chars={len(body.text or '')} enter={body.enter}"
    audit.record(device.name, "input", session_id, what)


@router.post("/sessions/{session_id}/resize", status_code=204)
def resize(session_id: str, body: Resize, _: CurrentDevice, terminal: Terminal, directory: Directory) -> None:
    _local_only(directory, session_id, "resizing")
    terminal.resize(session_id, body)


@router.post("/sessions/{session_id}/resize/release", status_code=204)
def release_size(session_id: str, _: CurrentDevice, terminal: Terminal, directory: Directory) -> None:
    if directory.remote_for(session_id) is None:  # nothing to give back for other sources
        terminal.release(session_id)


@router.post("/sessions/{session_id}/approve")
def approve(
    session_id: str, body: Approve, device: CurrentDevice, approvals: Approvals, directory: Directory,
    audit: Audit,
) -> ApprovalResult:  # fmt: skip
    remote = directory.remote_for(session_id)
    if remote is not None:
        state, option = remote.approve(session_id, body.option)
        result = ApprovalResult(session_id=session_id, state=state, option=option)
    else:
        result = approvals.approve(session_id, body.option)
    audit.record(device.name, "approve", session_id, f"state={result.state} option={result.option}")
    return result


@router.post("/sessions/{session_id}/deny")
def deny(
    session_id: str, device: CurrentDevice, approvals: Approvals, directory: Directory, audit: Audit
) -> ApprovalResult:
    remote = directory.remote_for(session_id)
    if remote is not None:
        result = ApprovalResult(session_id=session_id, state=remote.deny(session_id), option=None)
    else:
        result = approvals.deny(session_id)
    audit.record(device.name, "deny", session_id, f"state={result.state}")
    return result
