"""The owner's Inbox (`models.py`), on the hub: kept in `store.py`, handed to a session as one team task
(`teams/tasks.py`). Due dates (`due.py`) are acted on here by `fire_due`, run by the hub's own loop
(`schedule.py`), never by an agent: each exactly once (claimed in the same transaction as what it does).
Nothing here writes into a session but the one task a hand-off is, and the concierge's weekly nudge."""

from collections import Counter
from collections.abc import Callable
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any

from pydantic import ValidationError

from muxtower.config import InboxSettings
from muxtower.errors import Conflict, Invalid
from muxtower.inbox import due
from muxtower.inbox.models import (
    Handed,
    HandoffRole,
    HandoffSession,
    HandoffTargets,
    HandTarget,
    Inbox,
    InboxItem,
    InboxPatch,
    InboxStatus,
    NewInboxItem,
    OnDue,
)  # fmt: skip
from muxtower.inbox.store import InboxStore, Row
from muxtower.infra.audit import AuditLog
from muxtower.infra.db import Database
from muxtower.sessions.directory import SessionDirectory
from muxtower.teams.service import Member, TeamService
from muxtower.teams.tasks import TaskService

FROM = "the owner's Inbox"  # who a hand-off task is from, as its head says


def _norm(text: str) -> str:
    return " ".join(text.split()).lower()


class InboxService:
    def __init__(
        self, db: Database, store: InboxStore, settings: Callable[[], InboxSettings], teams: TeamService,
        directory: SessionDirectory, tasks: TaskService, audit: AuditLog,
    ) -> None:  # fmt: skip
        self.db = db
        self.store = store
        self.settings = settings
        self.teams = teams
        self.directory = directory
        self.tasks = tasks
        self.audit = audit
        self.changed: Callable[[], None] = lambda: None  # an item changed: set by the app (wakes the schedule)

    # --- reading --------------------------------------------------------------------------------------------

    def item(self, row: Row, now: datetime | None = None) -> InboxItem:
        s = self.settings()
        zone = s.zone()
        when = due.instant(row.due_at, row.due_date, zone, s.due_hour)
        target = None
        if row.target_project and (row.target_role or row.target_session):
            target = HandTarget(project=row.target_project, role=row.target_role, session_id=row.target_session)
        handed = None
        if row.handed_session and row.handed_project and row.handed_task_id is not None and row.handed_at:
            handed = Handed(
                to_role=row.handed_role, to_session=row.handed_session, project=row.handed_project,
                task_id=row.handed_task_id, at=row.handed_at,
            )  # fmt: skip
        return InboxItem(
            id=row.id, text=row.text, project=row.project, status=row.status, created_at=row.created_at,
            updated_at=row.updated_at, done_at=row.done_at, handed=handed, order=row.position, version=row.version,
            due=when, due_has_time=row.due_at is not None, on_due=row.on_due, due_target=target,
            due_state=due.state(when, row.status, now or datetime.now(UTC), zone), due_fired_at=row.due_fired_at,
        )  # fmt: skip

    def inbox(self, done: bool = False) -> Inbox:
        now = datetime.now(UTC)
        rows, history = self.store.listed(done, now)
        return Inbox(items=[self.item(r, now) for r in rows], done=[self.item(r, now) for r in history])

    def get(self, item_id: int) -> InboxItem:
        return self.item(self.store.get(item_id))

    # --- changing ---------------------------------------------------------------------------------------------

    def add(self, new: NewInboxItem, actor: str) -> InboxItem:
        now = datetime.now(UTC)
        row = Row(0, new.text, new.project, InboxStatus.OPEN, now, now, None, 0, 1)
        row = self._due(row, new.model_dump(exclude_unset=True), new.model_fields_set)
        row = self.store.add(row)
        self.audit.record(actor, "inbox-add", None, f"item {row.id}")
        self.changed()
        return self.item(row)

    def patch(self, item_id: int, body: dict[str, Any], actor: str) -> tuple[InboxItem, bool]:
        """The item changed, and True; or, when it changed since `if_version`, as it is now and False."""
        try:
            patch = InboxPatch.model_validate(body)
        except ValidationError as exc:
            raise Invalid(exc.errors()[0]["msg"]) from exc
        row = self.store.get(item_id)
        if row.version != patch.if_version:
            return self.item(row), False
        given = patch.model_fields_set
        now = datetime.now(UTC)
        if patch.text is not None:
            row = replace(row, text=patch.text)
        if "project" in given:
            row = replace(row, project=patch.project)
        if patch.status is InboxStatus.DONE and row.status is not InboxStatus.DONE:
            row = replace(row, status=InboxStatus.DONE, done_at=now)
        elif patch.status is InboxStatus.OPEN and row.status is not InboxStatus.OPEN:
            row = replace(
                row, status=InboxStatus.OPEN, done_at=None, handed_role=None, handed_session=None,
                handed_project=None, handed_task_id=None, handed_at=None,
            )  # fmt: skip
        row = self._due(row, patch.model_dump(), given)
        written = self.store.write(replace(row, updated_at=now), patch.if_version)
        if written is None:  # changed between the read and the write
            return self.get(item_id), False
        self.audit.record(actor, "inbox-edit", None, f"item {item_id}")
        self.changed()
        return self.item(written), True

    def _due(self, row: Row, values: dict[str, Any], given: set[str]) -> Row:
        """Its due date, what happens then and to whom, as given (null clears); a new date is acted on anew."""
        s = self.settings()
        if "due" in given:
            when = values.get("due")
            if when is None:
                row = replace(row, due_at=None, due_date=None, due_fired_at=None)
            else:
                has_time = values.get("due_has_time")
                at, day = due.kept(when, True if has_time is None else has_time, s.zone())
                row = replace(row, due_at=at, due_date=day, due_fired_at=None)
        elif "due_has_time" in given and values.get("due_has_time") is not None:
            current = due.instant(row.due_at, row.due_date, s.zone(), s.due_hour)
            if current is not None and values["due_has_time"] != (row.due_at is not None):
                at, day = due.kept(current, values["due_has_time"], s.zone())
                row = replace(row, due_at=at, due_date=day, due_fired_at=None)
        if "on_due" in given:
            row = replace(row, on_due=values.get("on_due") or OnDue.REMIND)
        if "due_target" in given:
            target = values.get("due_target")
            if target is None:
                row = replace(row, target_project=None, target_role=None, target_session=None)
            else:
                t = HandTarget.model_validate(target)
                row = replace(row, target_project=t.project, target_role=t.role, target_session=t.session_id)
        if row.on_due is OnDue.HAND_OFF and not row.target_project:
            raise Invalid("hand_off needs due_target: whom to hand it to")
        return row

    def delete(self, item_id: int, actor: str) -> None:
        self.store.delete(item_id)
        self.audit.record(actor, "inbox-delete", None, f"item {item_id}")
        self.changed()

    def order(self, ids: list[int], actor: str) -> Inbox:
        self.store.order(ids)
        self.audit.record(actor, "inbox-order")
        self.changed()
        return self.inbox()

    # --- handing ----------------------------------------------------------------------------------------------

    def receiver(self, target: HandTarget) -> Member:
        """Blocking. The session `target` names, or whoever holds its role in its project (without regard to
        case). Conflict when it is gone, or no one or several hold the role."""
        if target.session_id is not None:
            session = self.directory.find(target.session_id)
            if session is None or session.archived_at:
                raise Conflict(f"no session {target.session_id} (it is gone)")
            return self.teams.member(session)
        role = target.role or ""
        project = _norm(target.project)
        found = [m for m in self.teams.members() if _norm(m.project) == project and _norm(m.role or "") == _norm(role)]
        if not found:
            raise Conflict(f"no one in {target.project} holds {role.strip()}")
        if len(found) > 1:
            options = "; ".join(f"{m.session.id} ({m.session.name})" for m in found)
            raise Conflict(f"{len(found)} sessions hold {role.strip()} in {target.project}: hand to one of {options}")
        return found[0]

    def handed_now(self, row: Row, target: HandTarget, actor: str) -> Row:
        """Inside a transaction: the one task, and the item handed with its id."""
        to = self.receiver(target)
        task, _, _ = self.tasks.send(None, actor, to.session.id, row.text, from_label=FROM, wait=False)
        now = datetime.now(UTC)
        handed = replace(
            row, status=InboxStatus.HANDED, handed_role=to.role if target.role else None,
            handed_session=to.session.id, handed_project=target.project, handed_task_id=task.id, handed_at=now,
            updated_at=now,
        )  # fmt: skip
        written = self.store.write(handed, None)
        assert written is not None
        self.audit.record(actor, "inbox-hand", to.session.id, f"item {row.id} task {task.id}")
        return written

    def hand(self, item_id: int, target: HandTarget, actor: str) -> InboxItem:
        """Blocking. Sends it as one team task (`FROM`); it becomes handed."""
        with self.db.transaction():
            row = self.store.get(item_id)
            if row.status is InboxStatus.DONE:
                raise Conflict("it is done: open it again first")
            written = self.handed_now(row, target, actor)
        self.changed()
        return self.item(written)

    def targets(self, project: str) -> HandoffTargets:
        members = [m for m in self.teams.members() if _norm(m.project) == _norm(project)]
        counts = Counter(m.role for m in members if m.role)
        return HandoffTargets(
            project=project, default_role=self.store.handoff(project),
            roles=[HandoffRole(role=r, sessions=n) for r, n in sorted(counts.items(), key=lambda x: x[0].lower())],
            sessions=[HandoffSession(id=m.session.id, name=m.session.name, role=m.role)
                      for m in sorted(members, key=lambda m: m.session.name.lower())],
        )  # fmt: skip

    def set_handoff(self, project: str, role: str | None, actor: str) -> str | None:
        role = " ".join(role.split()) if role else None
        self.store.set_handoff(project, role or None)
        self.audit.record(actor, "inbox-handoff", None, project)
        return role or None

    def rename_project(self, old: str, new: str) -> bool:
        return self.store.rename_project(old, new)
