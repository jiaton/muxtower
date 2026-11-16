"""The owner's view of teams: a session's role and project set from the app, and the tasks it was sent or
sent (`teams/tasks.py`). Agents use the MCP tools for the same (`mcp/team_tools.py`)."""

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field

from muxtower.auth.deps import CurrentDevice
from muxtower.auth.routes import Audit
from muxtower.sessions.models import Session
from muxtower.teams.service import NOTE_CHARS, PROJECT_CHARS, ROLE_CHARS, TeamService
from muxtower.teams.tasks import TaskService

router = APIRouter(prefix="/v1", tags=["teams"])


def _teams(request: Request) -> TeamService:
    teams: TeamService = request.app.state.teams
    return teams


def _tasks(request: Request) -> TaskService:
    tasks: TaskService = request.app.state.team_tasks
    return tasks


Teams = Annotated[TeamService, Depends(_teams)]
Tasks = Annotated[TaskService, Depends(_tasks)]


class UpdateTeam(BaseModel):
    """Only what is given changes. An empty role clears it."""

    role: str | None = Field(default=None, max_length=ROLE_CHARS)
    note: str | None = Field(default=None, max_length=NOTE_CHARS)
    project: str | None = Field(default=None, min_length=1, max_length=PROJECT_CHARS)
    rename_project: bool = Field(default=False, description="rename its project, for every session in it")


class TeamTask(BaseModel):
    id: int
    at: datetime
    from_id: str | None = Field(description="the session that sent it; null: a device")
    from_label: str
    to_id: str
    text: str = Field(description="its start, whole while it is held")
    status: str = Field(description="delivered | held | undeliverable")
    delivered_at: datetime | None = None


@router.put("/sessions/{session_id}/team")
def update_team(
    session_id: str, body: UpdateTeam, request: Request, device: CurrentDevice, teams: Teams, audit: Audit
) -> Session:
    if "role" in body.model_fields_set or "note" in body.model_fields_set:
        current = teams.find(session_id)
        role = body.role if "role" in body.model_fields_set else current.role
        note = body.note if "note" in body.model_fields_set else current.note
        teams.set_role(session_id, role, note)
    if body.project:
        teams.set_project(session_id, body.project, body.rename_project)
    audit.record(device.name, "team", session_id, body.model_dump_json(exclude_unset=True))
    session: Session = request.app.state.directory.get(session_id)
    return session


@router.get("/sessions/{session_id}/tasks")
def session_tasks(
    session_id: str, _: CurrentDevice, tasks: Tasks, limit: Annotated[int, Query(ge=1, le=100)] = 20
) -> list[TeamTask]:
    """The tasks it was sent and sent, newest first."""
    return [TeamTask(**vars(t)) for t in tasks.repo.involving(session_id, limit)]


@router.get("/tasks/latest")
def latest_tasks(
    _: CurrentDevice, tasks: Tasks, to: Annotated[list[str], Query(max_length=200, description="session ids")]
) -> dict[str, TeamTask]:
    """The last task each of these sessions was sent (as `my_team` shows it), by session id; a session sent
    none is left out. For a team card: one request for every member."""
    latest = tasks.recent(to, 1)
    return {session_id: TeamTask(**vars(sent[0])) for session_id, sent in latest.items() if sent}


class TeamMessage(BaseModel):
    at: datetime
    from_id: str | None = Field(description="the session that typed it; null: one not known by its id")
    from_label: str
    to_id: str


class TeamActivity(BaseModel):
    """A project's team at work: its members, and the tasks and messages sent from or to them."""

    project: str
    members: list[str] = Field(description="its sessions' ids")
    tasks: list[TeamTask] = Field(description="oldest first")
    messages: list[TeamMessage] = Field(description="typed into a session (send_message): no text kept")
    owner: dict[str, int] = Field(
        default_factory=dict, description="per member: how often the owner typed into, approved or denied in it"
    )


@router.get("/projects/{project:path}/activity")
async def project_activity(
    project: str, request: Request, _: CurrentDevice, teams: Teams, tasks: Tasks, audit: Audit,
    hours: Annotated[int, Query(ge=1, le=168)] = 24,
) -> TeamActivity:  # fmt: skip
    """What a project's team sent each other (and others, and was sent) in the last `hours`: for its diagram.
    Tasks or messages from or to another project's session are included, the other end named by its id."""
    members = {m.session.id for m in await asyncio.to_thread(teams.members) if m.project == project}
    since = datetime.now(UTC) - timedelta(hours=hours)
    sent = [t for t in tasks.repo.since(since, 500) if t.to_id in members or (t.from_id or "") in members]
    typed = []
    for at, actor, to_id in audit.messages(since):
        from_id = actor.removeprefix("session ") if actor.startswith("session ") else None
        if to_id in members or (from_id or "") in members:
            typed.append(TeamMessage(at=at, from_id=from_id, from_label=actor, to_id=to_id))
    owner = {sid: n for sid, n in audit.owner_touches(since).items() if sid in members}
    return TeamActivity(
        project=project, members=sorted(members), tasks=[TeamTask(**vars(t)) for t in sent], messages=typed, owner=owner
    )
