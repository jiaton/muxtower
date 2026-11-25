"""The owner's Inbox: ideas across all projects, kept on the hub (a node asks it) and looked after by the
concierge. An item is open, handed (sent to a session as one task) or done; done items leave the list and are
kept as history for `HISTORY_DAYS`. Every change bumps an item's `version`: an edit names the version it read
(`if_version`) and a stale one is refused with the item as it is now, so nobody overwrites a newer edit."""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field, field_validator, model_validator

from muxtower.chips.service import MAX_PROJECT_NAME
from muxtower.teams.service import ROLE_CHARS

TEXT_CHARS = 4000  # an idea, not a document
MAX_ITEMS = 1000  # open and handed items, at most
HISTORY_DAYS = 30  # a done item is kept this long, then deleted


class InboxStatus(StrEnum):
    OPEN = "open"
    HANDED = "handed"
    DONE = "done"


def _project(project: str | None) -> str | None:
    if project is None:
        return None
    project = project.strip()
    if not project:
        return None
    if len(project) > MAX_PROJECT_NAME:
        raise ValueError(f"a project name is at most {MAX_PROJECT_NAME} characters")
    return project


def _text(text: str) -> str:
    if not text.strip():
        raise ValueError("an item needs some text")
    return text.strip()


class Handed(BaseModel):
    """To whom an item went, as one task (`send_task`)."""

    to_role: str | None = Field(default=None, description="the role it was handed to (whoever held it then)")
    to_session: str = Field(description="the session that got it (the role's holder, or the one named)")
    project: str
    task_id: int = Field(description="the team task it went as")
    at: datetime


class InboxItem(BaseModel):
    id: int
    text: str
    project: str | None = Field(default=None, description="the project it is about, if any")
    status: InboxStatus
    created_at: datetime
    updated_at: datetime
    done_at: datetime | None = None
    handed: Handed | None = Field(default=None, description="set once it was handed")
    order: int = Field(description="its place in the owner's order: lower first")
    version: int = Field(description="bumped on every change: send it back as if_version when changing it")


class Inbox(BaseModel):
    items: list[InboxItem] = Field(description="open and handed items, in the owner's order")
    done: list[InboxItem] = Field(
        default_factory=list, description=f"done items of the last {HISTORY_DAYS} days, newest first (with ?done=1)"
    )


class NewInboxItem(BaseModel):
    text: str = Field(min_length=1, max_length=TEXT_CHARS)
    project: str | None = Field(default=None, max_length=MAX_PROJECT_NAME)

    @field_validator("text")
    @classmethod
    def _filled(cls, text: str) -> str:
        return _text(text)

    @field_validator("project")
    @classmethod
    def _named(cls, project: str | None) -> str | None:
        return _project(project)


class InboxPatch(BaseModel):
    """What to change; a field left out stays as it is (project null: no project)."""

    text: str | None = Field(default=None, min_length=1, max_length=TEXT_CHARS)
    project: str | None = Field(default=None, max_length=MAX_PROJECT_NAME)
    status: InboxStatus | None = Field(
        default=None, description="open or done (done: it leaves the list; open: back from handed or done)"
    )
    if_version: int = Field(description="the version you read: 409 with the item as it is now when it changed since")

    @field_validator("text")
    @classmethod
    def _filled(cls, text: str | None) -> str | None:
        return None if text is None else _text(text)

    @field_validator("project")
    @classmethod
    def _named(cls, project: str | None) -> str | None:
        return _project(project)

    @field_validator("status")
    @classmethod
    def _settable(cls, status: InboxStatus | None) -> InboxStatus | None:
        if status is InboxStatus.HANDED:
            raise ValueError("an item is handed by POST /v1/inbox/{id}/hand")
        return status


class InboxConflict(BaseModel):
    """409 to a stale `if_version`: the item as it is now."""

    detail: str
    current: InboxItem


class InboxOrder(BaseModel):
    ids: list[int] = Field(
        max_length=MAX_ITEMS, description="item ids, first to last; items not named keep their order after these"
    )


class HandInboxItem(BaseModel):
    """Exactly one of role and session_id."""

    project: str = Field(min_length=1, max_length=MAX_PROJECT_NAME)
    role: str | None = Field(
        default=None,
        max_length=ROLE_CHARS,
        description="a role in the project (without regard to case): whoever holds it",
    )
    session_id: str | None = Field(default=None, max_length=200, description="a session, by id")

    @model_validator(mode="after")
    def _one(self) -> "HandInboxItem":
        if (self.role is None) == (self.session_id is None):
            raise ValueError("give exactly one of role and session_id")
        return self


class Handoff(BaseModel):
    """A project's default hand-off role: who its Inbox items go to unless the owner picks another."""

    role: str | None = Field(default=None, max_length=ROLE_CHARS, description="free text; null: none")


class HandoffRole(BaseModel):
    role: str
    sessions: int = Field(description="how many of the project's sessions hold it")


class HandoffSession(BaseModel):
    id: str
    name: str
    role: str | None = None


class HandoffTargets(BaseModel):
    """Who an item of a project can be handed to: its live roles and sessions (empty lists: no one yet)."""

    project: str
    default_role: str | None = None
    roles: list[HandoffRole] = Field(description="distinct roles of the project's live sessions, by name")
    sessions: list[HandoffSession] = Field(description="the project's live sessions")
