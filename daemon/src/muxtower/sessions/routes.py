import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Request

from muxtower.approval.models import ApprovalResult, Approve
from muxtower.auth.deps import CurrentDevice
from muxtower.auth.routes import Audit
from muxtower.runtimes.models import RuntimeInfo
from muxtower.sessions.archiving import Archiver
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.launcher import Launcher
from muxtower.sessions.models import (
    Conversation,
    CreateSession,
    DetectedFolder,
    HideSession,
    MarkRead,
    PinSession,
    Placement,
    Session,
    SessionNotify,
    UpdateSession,
)
from muxtower.sessions.placement import Placements
from muxtower.sessions.service import SessionService
from muxtower.terminal.models import Resize, Screen, SendInput

router = APIRouter(prefix="/v1", tags=["sessions"])


def _sessions(request: Request) -> SessionService:
    service: SessionService = request.app.state.sessions
    return service


def _directory(request: Request) -> SessionDirectory:
    directory: SessionDirectory = request.app.state.directory
    return directory


def _placements(request: Request) -> Placements:
    placements: Placements = request.app.state.placements
    return placements


Sessions = Annotated[SessionService, Depends(_sessions)]
Directory = Annotated[SessionDirectory, Depends(_directory)]


def _archiver(request: Request) -> Archiver:
    archiver: Archiver = request.app.state.archiver
    return archiver


def _launcher(request: Request) -> Launcher:
    launcher: Launcher = request.app.state.launcher
    return launcher


PlacementsDep = Annotated[Placements, Depends(_placements)]
LauncherDep = Annotated[Launcher, Depends(_launcher)]
ArchiverDep = Annotated[Archiver, Depends(_archiver)]


@router.get("/runtimes")
def list_runtimes(_: CurrentDevice, launcher: LauncherDep) -> list[RuntimeInfo]:
    """What can be started here (a node's are in GET /v1/nodes)."""
    return launcher.runtimes()


@router.get("/sessions")
def list_sessions(_: CurrentDevice, directory: Directory) -> list[Session]:
    return directory.list()


@router.post("/sessions", status_code=201)
async def create_session(body: CreateSession, device: CurrentDevice, launcher: LauncherDep, audit: Audit) -> Session:
    session = await asyncio.to_thread(launcher.create, body)
    headless = " headless" if body.headless else ""
    audit.record(device.name, "create", session.id, f"runtime={session.runtime} cwd={session.cwd}{headless}")
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


@router.post("/sessions/{session_id}/hide", status_code=204)
def hide_session(session_id: str, body: HideSession, request: Request, _: CurrentDevice, directory: Directory) -> None:
    """Hide it from the lists (`{"hidden": false}` shows it again); the same on every device."""
    directory.hide(session_id, body.hidden)
    request.app.state.bus.publish("sessions", None)


@router.post("/sessions/{session_id}/pin", status_code=204)
def pin_session(session_id: str, body: PinSession, request: Request, _: CurrentDevice, directory: Directory) -> None:
    """Pin it above the others in the lists (`{"pinned": false}` unpins it); the same on every device."""
    directory.pin(session_id, body.pinned)
    request.app.state.bus.publish("sessions", None)


@router.put("/sessions/{session_id}/notify")
def set_notify(
    session_id: str, body: SessionNotify, request: Request, _: CurrentDevice, directory: Directory
) -> Session:
    """Which push notifications it sends: all, only when it needs the owner, or none; the same on every
    device."""
    session = directory.set_notify(session_id, body.level)
    request.app.state.bus.publish("sessions", None)
    return session


@router.put("/sessions/{session_id}/placement")
def place_session(
    session_id: str, body: Placement, request: Request, _: CurrentDevice, placements: PlacementsDep
) -> Session:
    """Where it runs, for a session whose source does not say (`capabilities.place`); empty fields clear."""
    session = placements.place(session_id, body)
    request.app.state.bus.publish("sessions", None)
    return session


@router.post("/sessions/{session_id}/placement/detect")
async def detect_placement(session_id: str, _: CurrentDevice, placements: PlacementsDep) -> DetectedFolder:
    """Reads the session's whole log for the folder its tool calls ran in: a suggestion to place it there
    (PUT /placement), nothing is kept."""
    return DetectedFolder(folder=await asyncio.to_thread(placements.detect, session_id))


@router.delete("/sessions/{session_id}", status_code=204)
def terminate_session(
    session_id: str, request: Request, device: CurrentDevice, directory: Directory, audit: Audit
) -> None:
    """Stops the session (`capabilities.terminate`); an archived one is deleted from the archive."""
    directory.terminate(session_id)
    audit.record(device.name, "terminate", session_id)
    request.app.state.bus.publish("sessions", None)


@router.post("/sessions/{session_id}/archive", status_code=204)
async def archive_session(
    session_id: str, request: Request, device: CurrentDevice, archiver: ArchiverDep, audit: Audit
) -> None:
    """Ends the session (closes its tmux pane, archives it on Remote Control) and keeps its conversation
    to read under `archived_at` (`capabilities.archive`)."""
    await asyncio.to_thread(archiver.archive, session_id)
    audit.record(device.name, "archive", session_id)
    request.app.state.bus.publish("sessions", None)


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
    result = directory.approve(session_id, body.option, body.answers)
    audit.record(device.name, "approve", session_id, f"state={result.state} option={result.option}")
    return result


@router.post("/sessions/{session_id}/deny")
def deny(session_id: str, device: CurrentDevice, directory: Directory, audit: Audit) -> ApprovalResult:
    result = directory.deny(session_id)
    audit.record(device.name, "deny", session_id, f"state={result.state}")
    return result
