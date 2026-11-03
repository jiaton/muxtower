"""Work one session hands another (`send_task`): sent as a message that says who it is from, and recorded.

The receiver is named by its session id, or by a role of the sender's project (when only one session has
it). A session on Remote Control gets it at once (a structured message, queued by Claude Code). One in
tmux gets it at once too, typed in, unless it waits on the owner (a permission prompt or a question),
where typing would answer the prompt: then the task is held and sent as soon as it stops waiting. Nothing
here schedules work; the record is for seeing what was asked of whom."""

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

from muxtower.errors import Conflict, Invalid, NotFound
from muxtower.infra.bus import EventBus
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.models import Session
from muxtower.sessions.ports import SessionSource
from muxtower.teams.ports import Task, TaskRepository
from muxtower.teams.service import Member, TeamService
from muxtower.terminal.models import SendInput

logger = logging.getLogger("muxtower.teams")

PREFIX = "[muxtower task from"
TEXT_CHARS = 20000
RETRY_SECONDS = 30.0  # held tasks are tried again this often, besides on every change of state


def label(sender: Member | None, device: str) -> str:
    if sender is None:
        return f"{device} (a device, not a session)"
    return f"{sender.session.name} ({sender.role or 'no role'}) · {sender.session.id}"


def _by_remote_control(session: Session) -> bool:
    """Its messages go to Remote Control, structured: they cannot land in a prompt."""
    return session.source is SessionSource.REMOTE_CONTROL or (
        session.remote_id is not None and session.runtime == "claude-code"
    )


class TaskService:
    def __init__(self, teams: TeamService, directory: SessionDirectory, repo: TaskRepository) -> None:
        self.teams = teams
        self.directory = directory
        self.repo = repo

    def receiver(self, to: str, sender: Member | None) -> Member:
        """Blocking. A session id, else a role among the sender's project (every project's, for a device)."""
        if session := self.directory.find(to):
            return self.teams.member(session)
        wanted = " ".join(to.split()).lower()
        members = [m for m in self.teams.members() if sender is None or m.project == sender.project]
        members = [m for m in members if sender is None or m.session.id != sender.session.id]
        found = [m for m in members if (m.role or "").lower() == wanted]
        if len(found) == 1:
            return found[0]
        where = f"project {sender.project}" if sender else "any project"
        if found:
            options = "; ".join(f"{m.session.id} ({m.session.name}, {m.session.state.value})" for m in found)
            raise Conflict(f"{len(found)} sessions have role {to!r} in {where}: send to one of {options}")
        roles = sorted({m.role for m in members if m.role})
        known = f"roles there: {', '.join(roles)}" if roles else "nobody there has a role yet"
        raise NotFound(f"no session {to!r} and no role {to!r} in {where} ({known})")

    def send(self, sender_id: str | None, device: str, to: str, text: str) -> tuple[Task, Member]:
        """Blocking. Sends (or holds) the task; returns it and its receiver."""
        body = text.strip()
        if not body:
            raise Invalid("a task needs some text")
        if len(body) > TEXT_CHARS:
            raise Invalid(f"a task is at most {TEXT_CHARS} characters")
        sender = self.teams.find(sender_id) if sender_id else None
        receiver = self.receiver(to, sender)
        if sender and receiver.session.id == sender.session.id:
            raise Invalid("that is you")
        task = Task(0, datetime.now(UTC), sender_id, label(sender, device), receiver.session.id, body, "held")
        self.repo.add(task)
        self._try(task)
        return task, receiver

    def _try(self, task: Task) -> None:
        """Blocking. Sends a held task if its receiver can take it now, read afresh."""
        session = self.directory.find(task.to_id)
        if session is None or session.archived_at:
            task.status = "undeliverable"
            self.repo.update(task)
            return
        if session.needs_attention and not _by_remote_control(session):
            return  # typing now would answer its prompt: held until it stops waiting
        message = f"{PREFIX} {task.from_label}] {task.text}"
        try:
            self.directory.send_input(session.id, SendInput(text=message, enter=True))
        except Conflict as exc:
            logger.warning("task %s to %s not delivered yet: %s", task.id, session.id, exc)
            return
        task.status, task.delivered_at = "delivered", datetime.now(UTC)
        self.repo.update(task)

    def retry(self) -> None:
        """Blocking. Tries every held task again."""
        for task in self.repo.held():
            self._try(task)

    def recent(self, session_ids: list[str], each: int = 3) -> dict[str, list[Task]]:
        return self.repo.latest_to(session_ids, each)

    async def run_loop(self, bus: EventBus) -> None:
        queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        bus.subscribe("sessions", queue)
        bus.subscribe("attention:*", queue)
        while True:
            try:
                await asyncio.wait_for(queue.get(), timeout=RETRY_SECONDS)
                await asyncio.sleep(1.0)  # a burst of changes settles
                while not queue.empty():
                    queue.get_nowait()
            except TimeoutError:
                pass
            try:
                await asyncio.to_thread(self.retry)
            except Exception:
                logger.exception("could not deliver held tasks")
