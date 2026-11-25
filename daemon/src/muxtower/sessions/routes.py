import asyncio
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

from muxtower.approval.models import ApprovalResult, Approve
from muxtower.auth.deps import CurrentDevice
from muxtower.auth.routes import Audit
from muxtower.errors import Conflict, status_of
from muxtower.runtimes.models import RuntimeInfo
from muxtower.sessions.archiving import Archiver
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.launcher import Launcher
from muxtower.sessions.login import LoginStart, start_claude_login
from muxtower.sessions.models import (
    AutoRead,
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
    detail = f"runtime={session.runtime} cwd={session.cwd}{headless}"
    await asyncio.to_thread(audit.record, device.name, "create", session.id, detail)
    return session


@router.post("/claude-login", status_code=201)
async def claude_login(request: Request, device: CurrentDevice, audit: Audit) -> LoginStart:
    """Starts `claude auth login` on this daemon's machine (`sessions/login.py`): open `url`, sign in, and
    type the code the page gives into the session it returns."""
    started = await asyncio.to_thread(start_claude_login, request.app.state.sessions)
    await asyncio.to_thread(audit.record, device.name, "claude-login", started.session.id)
    return started


@router.get("/sessions/{session_id}")
def get_session(session_id: str, _: CurrentDevice, directory: Directory) -> Session:
    return directory.get(session_id)


@router.get("/sessions/{session_id}/conversation")
def get_conversation(
    session_id: str,
    _: CurrentDevice,
    directory: Directory,
    after: int = 0,
    limit: int = 100,
    around: int | None = None,
) -> Conversation:
    """Structured conversation items after `after` (0 = the latest `limit`); `around`: from that item on,
    read where it is however far back (a search's hit, `/v1/search`). Only for sessions whose
    capabilities include `conversation`; others have a screen instead."""
    return directory.conversation(session_id, after, max(1, min(limit, 400)), around)


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


@router.put("/sessions/{session_id}/auto-read")
def set_auto_read(session_id: str, body: AutoRead, request: Request, _: CurrentDevice, directory: Directory) -> Session:
    """Mark its finished turns read as they end (for a chatty worker), or stop; the same on every device.
    What needs the owner (a prompt, a question, a plan) still shows."""
    session = directory.set_auto_read(session_id, body.auto_read)
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
async def terminate_session(
    session_id: str, request: Request, device: CurrentDevice, directory: Directory, archiver: ArchiverDep,
    audit: Audit,
) -> None:  # fmt: skip
    """An archived session: deleted from the archive (muxtower's copy; the agent's own transcript is not
    touched). One a restart interrupted, or a live one muxtower started (`capabilities.terminate`): archived
    (ended, its history kept: nothing ends without it), as POST /archive does; any other is never ended this
    way (409): POST /archive says what ending it means."""

    def end() -> None:  # the database, tmux: never on the event loop
        session = directory.get(session_id)
        if session.archived_at:
            directory.terminate(session_id)
            audit.record(device.name, "delete", session_id)
        elif not session.capabilities.terminate and not session.interrupted_at:
            raise Conflict("this session was not started by muxtower: archive it (POST /archive) to end it")
        else:
            archiver.archive(session_id)
            audit.record(device.name, "archive", session_id)

    await asyncio.to_thread(end)
    request.app.state.bus.publish("sessions", None)


@router.post("/sessions/{session_id}/archive", status_code=204)
async def archive_session(
    session_id: str, request: Request, device: CurrentDevice, archiver: ArchiverDep, audit: Audit
) -> None:
    """Ends the session (closes its tmux pane, archives it on Remote Control) and keeps its conversation
    to read under `archived_at` (`capabilities.archive`)."""
    await asyncio.to_thread(archiver.archive, session_id)
    await asyncio.to_thread(audit.record, device.name, "archive", session_id)
    request.app.state.bus.publish("sessions", None)


@router.get(
    "/sessions/{session_id}/image",
    response_class=Response,
    responses={200: {"content": {"image/*": {}}, "description": "the image file"}},
)
def get_image(session_id: str, path: str, _: CurrentDevice, directory: Directory) -> Response:
    """An image the session's conversation shows (`ConversationItem.images`), from the machine it runs on.
    No other file: 404 for a path the conversation does not show, 409 when the session runs elsewhere."""
    image = directory.image(session_id, path)
    headers = {"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"}
    return Response(image.data, media_type=image.media_type, headers=headers)


@router.get("/sessions/{session_id}/screen")
def get_screen(session_id: str, _: CurrentDevice, directory: Directory, history: int = 200) -> Screen:
    return directory.screen(session_id, history)


@router.post(
    "/sessions/{session_id}/input",
    status_code=204,
    responses={202: {"description": "held: the session shows a dialog; typed in once it has gone"}},
)
def send_input(session_id: str, body: SendInput, device: CurrentDevice, directory: Directory, audit: Audit) -> Response:
    # The typed text itself is never logged.
    what = f"key={body.key}" if body.key else f"text chars={len(body.text or '')} enter={body.enter}"
    try:
        held = directory.send_or_hold(session_id, body)
    except Exception as error:
        # Kept too: a send that failed leaves a trace where the daemon's own log may not be kept.
        audit.record(device.name, "input failed", session_id, f"status={status_of(error)} {what}")
        raise
    audit.record(device.name, "input", session_id, what + (" held" if held else ""))
    return Response(status_code=202 if held else 204)


class AcceptSuggestion(BaseModel):
    text: str = Field(description="the suggestion as the session showed it (`Session.suggestion`)")


@router.post(
    "/sessions/{session_id}/suggestion",
    status_code=204,
    responses={409: {"description": "no longer that suggestion, its input not empty, or a dialog up"}},
)
def accept_suggestion(
    session_id: str, body: AcceptSuggestion, device: CurrentDevice, directory: Directory, audit: Audit
) -> None:
    """Send the prompt the agent suggests in its empty input line, as it is (Claude Code: → then Enter),
    after reading its screen again."""
    directory.accept_suggestion(session_id, body.text)
    audit.record(device.name, "input", session_id, f"suggestion chars={len(body.text)}")


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


class SessionName(BaseModel):
    name: str
    source: str = Field(description="muxtower | claude (its own title) | set in claude | remote control | codex")
    last_seen: datetime


@router.get("/sessions/{session_id}/names")
def session_names(session_id: str, _: CurrentDevice, directory: Directory) -> list[SessionName]:
    """Other names it went by, latest first (at most 10, not the one it has): offered when renaming it."""
    return [SessionName(name=n.name, source=n.source, last_seen=n.last_seen) for n in directory.names(session_id)]
