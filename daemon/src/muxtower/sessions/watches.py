"""Watching a session from another session (MCP `watch_session` by any session but the concierge, which has
its own): the watcher is told, as a `[muxtower event #N · time]` line like the concierge's, when the watched
session finishes a turn, starts needing the owner, or ends. Events wait while the watcher shows a prompt
(typing then would answer it), like a task; a watcher that ended or was archived watches nothing more.

Kept in memory: after a restart a session watches again by calling watch_session."""

import asyncio
import hashlib
import logging
import threading
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from muxtower.concierge.events import Event, render
from muxtower.errors import Conflict, Invalid, NotFound
from muxtower.infra.bus import EventBus
from muxtower.runtimes.models import AgentState
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.models import Session
from muxtower.terminal.models import SendInput

logger = logging.getLogger("muxtower.watches")

KEEP = 100  # events kept per watcher, for list_events
SETTLE_SECONDS = 1.0


def _fingerprint(session: Session) -> tuple[str, str]:
    return session.state.value, hashlib.sha256((session.last_message or "").encode()).hexdigest()[:16]


@dataclass
class Watched:
    name: str
    seen: tuple[str, str]
    cursor: int | None


@dataclass
class Told:
    number: int
    line: str
    delivered: bool = False


@dataclass
class Watcher:
    watched: dict[str, Watched] = field(default_factory=dict)
    events: deque[Told] = field(default_factory=lambda: deque(maxlen=KEEP))


class SessionWatches:
    def __init__(self, directory: SessionDirectory) -> None:
        self.directory = directory
        self._lock = threading.Lock()
        self._watchers: dict[str, Watcher] = {}
        self._number = 0

    def _latest(self, session: Session) -> int | None:
        if not session.capabilities.conversation:
            return None
        try:
            return self.directory.conversation(session.id, 0, 1).latest_seq
        except (Conflict, NotFound):
            return None

    def watch(self, watcher: str, session_id: str) -> Session:
        if watcher == session_id:
            raise Invalid("a session does not watch itself")
        session = self.directory.get(session_id)
        with self._lock:
            w = self._watchers.setdefault(watcher, Watcher())
            w.watched[session.id] = Watched(session.name, _fingerprint(session), self._latest(session))
        return session

    def unwatch(self, watcher: str, session_id: str) -> bool:
        """Whether it was watched here."""
        with self._lock:
            w = self._watchers.get(watcher)
            return bool(w and w.watched.pop(session_id, None))

    def forget(self, watcher: str) -> None:
        with self._lock:
            self._watchers.pop(watcher, None)

    def recorded(self, watcher: str, after: int, limit: int = 50) -> list[Told]:
        with self._lock:
            w = self._watchers.get(watcher)
            return [t for t in (w.events if w else []) if t.number > after][:limit]

    def _tell(self, w: Watcher, event: Event) -> None:
        w.events.append(Told(event.number, render(event)))

    def _event(self, session_id: str, watched: Watched, kind: str, session: Session | None = None) -> Event:
        self._number += 1
        name = session.name if session else watched.name
        event = Event(
            number=self._number, at=datetime.now().astimezone(), session_id=session_id, name=name,
            watched_as=watched.name if watched.name != name else None, kind=kind,
        )  # fmt: skip
        if session is not None:
            event.state, event.after, event.latest = session.state.value, watched.cursor, self._latest(session)
            if event.latest is not None:
                watched.cursor = event.latest
        return event

    def updates(self) -> None:
        """Blocking. An event for each watched session that finished a turn, started needing the owner, or
        ended."""
        with self._lock:
            watchers = {k: v for k, v in self._watchers.items() if v.watched}
        for w in watchers.values():
            for session_id, watched in list(w.watched.items()):
                session = self.directory.find(session_id)
                if session is None or session.archived_at:
                    self._tell(w, self._event(session_id, watched, "ended"))
                    w.watched.pop(session_id, None)
                    continue
                now = _fingerprint(session)
                if now == watched.seen:
                    continue
                before, watched.seen = watched.seen, now
                if session.needs_attention and before[0] != session.state.value:
                    event = self._event(session_id, watched, "needs_owner", session)
                    if pending := session.pending:
                        event.asks = f"{pending.tool_name or ''} {pending.detail or ''}".strip() or None
                        event.options = [(o.key, o.label) for o in pending.options]
                    self._tell(w, event)
                elif session.state != AgentState.BUSY and before[1] != now[1]:
                    event = self._event(session_id, watched, "finished", session)
                    event.said = session.reply_summary or session.last_message or None
                    self._tell(w, event)

    def deliver(self) -> None:
        """Blocking. Each watcher's untold events as one message, once it shows no prompt; a watcher that
        ended or was archived is forgotten."""
        with self._lock:
            watchers = dict(self._watchers)
        for watcher_id, w in watchers.items():
            waiting = [t for t in w.events if not t.delivered]
            watcher = self.directory.find(watcher_id)
            if watcher is None or watcher.archived_at:
                self.forget(watcher_id)
                continue
            if not waiting or watcher.needs_attention:
                continue
            text = ("\n" if watcher.remote_id else " | ").join(t.line for t in waiting)
            try:
                self.directory.send_input(watcher_id, SendInput(text=text, enter=True))
            except Exception as exc:  # noqa: BLE001 - tried again on the next change
                logger.warning("could not tell %s about the sessions it watches: %s", watcher_id, exc)
                continue
            for t in waiting:
                t.delivered = True

    async def run_loop(self, bus: EventBus) -> None:
        queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        bus.subscribe("sessions", queue)
        bus.subscribe("attention:*", queue)
        while True:
            await queue.get()
            await asyncio.sleep(SETTLE_SECONDS)
            while not queue.empty():
                queue.get_nowait()
            try:
                await asyncio.to_thread(self.updates)
                await asyncio.to_thread(self.deliver)
            except Exception:
                logger.exception("could not tell watchers")
