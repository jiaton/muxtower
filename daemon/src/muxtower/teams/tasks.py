"""Work one session hands another (`send_task`): sent as a message that says who it is from, and recorded.

The receiver is named by its session id, or by a role of the sender's project (when only one session has
it). team_tasks is the queue: `send` checks the task, stores it held and wakes the delivery loop, which
alone sends (one writer, like every loop here). It goes through each receiver's held tasks in order: one
on Remote Control gets them at once (structured messages, queued by Claude Code); one in tmux too, typed
in, unless it waits on the owner (a permission prompt or a question), where typing would answer the
prompt: its tasks then wait until it stops waiting, the later behind the earlier. A send that fails stays
held for the next round, and a restart goes on where it stopped. Nothing here schedules work; the record
is for seeing what was asked of whom."""

import asyncio
import logging
import threading
from collections import defaultdict
from concurrent.futures import Future
from concurrent.futures import TimeoutError as FutureTimeout
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
RETRY_SECONDS = 30.0  # held tasks are tried again this often, besides on a new task and every change of state
ANSWER_SECONDS = 3.0  # how long `send` waits for the loop to say what became of its task


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
        self.answer_seconds = ANSWER_SECONDS
        self._loop: asyncio.AbstractEventLoop | None = None
        self._wake: asyncio.Event | None = None
        self._answers: dict[int, Future[str]] = {}  # what became of a task its sender waits on
        self._lock = threading.Lock()

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

    def send(self, sender_id: str | None, device: str, to: str, text: str) -> tuple[Task, Member, str]:
        """Blocking. Queues the task for the delivery loop and waits a moment for what became of it:
        delivered, waiting (the receiver waits on the owner), undeliverable, or queued (not yet known)."""
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
        answer: Future[str] = Future()
        with self._lock:
            self.repo.add(task)
            self._answers[task.id] = answer
        try:
            if not self.wake():
                return task, receiver, "queued"  # no loop runs (yet): it sends once one does
            return task, receiver, answer.result(self.answer_seconds)
        except FutureTimeout:
            return task, receiver, "queued"
        finally:
            with self._lock:
                self._answers.pop(task.id, None)

    def wake(self) -> bool:
        """From any thread: the delivery loop goes through the queue now. False while none runs."""
        if self._loop is None or self._wake is None:
            return False
        self._loop.call_soon_threadsafe(self._wake.set)
        return True

    def deliver(self) -> None:
        """Blocking; the delivery loop's only, which alone sends. Each receiver's held tasks in order: one
        that cannot go now (its receiver waits on the owner, or the send failed) keeps the later ones back."""
        queues: dict[str, list[Task]] = defaultdict(list)
        for task in self.repo.held():
            queues[task.to_id].append(task)
        for to_id, queue in queues.items():
            session = self.directory.find(to_id)
            for task in queue:
                outcome = self._send(task, session)
                self._answer(task.id, outcome)
                if outcome in ("waiting", "failed"):
                    break  # the rest of this receiver's queue waits behind it

    def _send(self, task: Task, session: Session | None) -> str:
        """Blocking. delivered, undeliverable, waiting or failed (the last two: it stays held)."""
        if session is None or session.archived_at:
            task.status = "undeliverable"
            self.repo.update(task)
            return "undeliverable"
        if session.needs_attention and not _by_remote_control(session):
            return "waiting"  # typing now would answer its prompt
        message = f"{PREFIX} {task.from_label}] {task.text}"
        try:
            self.directory.send_input(session.id, SendInput(text=message, enter=True))
        except Exception as exc:  # noqa: BLE001 - held, and tried again: the loop must go on
            logger.warning("task %s to %s not delivered yet: %s", task.id, session.id, exc)
            return "failed"
        task.status, task.delivered_at = "delivered", datetime.now(UTC)
        self.repo.update(task)
        return "delivered"

    def _answer(self, task_id: int, outcome: str) -> None:
        with self._lock:
            answer = self._answers.get(task_id)
        if answer is not None and not answer.done():
            answer.set_result(outcome)

    def recent(self, session_ids: list[str], each: int = 3) -> dict[str, list[Task]]:
        return self.repo.latest_to(session_ids, each)

    async def run_loop(self, bus: EventBus) -> None:
        self._loop, self._wake = asyncio.get_running_loop(), asyncio.Event()
        queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        bus.subscribe("sessions", queue)
        bus.subscribe("attention:*", queue)

        async def changes() -> None:  # a receiver may have stopped waiting: a signal, nothing more
            while True:
                await queue.get()
                assert self._wake is not None
                self._wake.set()

        watcher = asyncio.create_task(changes())
        try:
            while True:
                try:
                    await asyncio.to_thread(self.deliver)  # first: what a restart left held
                except Exception:
                    logger.exception("could not deliver held tasks")
                try:
                    await asyncio.wait_for(self._wake.wait(), RETRY_SECONDS)
                except TimeoutError:
                    pass
                self._wake.clear()
        finally:
            watcher.cancel()
