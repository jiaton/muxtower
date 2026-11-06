"""A name the owner gives a Claude Code session in muxtower is its name on Claude's side too. One that
also runs Remote Control is retitled there (claude.ai lists it so, and its Claude Code takes the title).
Another, in tmux, is told `/rename <name>`, typed in only while it is idle at its input box: never in the
middle of a turn or into a dialog (where it would be an answer). Until then the rename waits, and is tried
again whenever its state changes. Kept in memory: a restart drops a rename not yet typed in."""

import asyncio
import logging
import threading
from typing import Any

from muxtower.infra.bus import EventBus
from muxtower.runtimes.models import AgentState
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.models import Session
from muxtower.terminal.models import SendInput

logger = logging.getLogger("muxtower.titles")

RUNTIME = "claude-code"
SETTLE_SECONDS = 1.0


def _line(name: str) -> str:
    return " ".join(name.split())  # one line: a newline would send it early


class ClaudeTitles:
    def __init__(self, directory: SessionDirectory) -> None:
        self.directory = directory
        self._lock = threading.Lock()
        self.waiting: dict[str, str] = {}  # session id -> name to /rename it to, once idle

    def renamed(self, session: Session, name: str) -> None:
        """Blocking. Its new name, on Claude's side too."""
        if session.runtime != RUNTIME or not name.strip():
            return
        remote = self.directory.source_of(session.remote_id) if session.remote_id else None
        if remote is not None and hasattr(remote, "rename"):
            try:
                remote.rename(session.remote_id, _line(name))
                return
            except Exception as exc:  # noqa: BLE001 - then the way a pane takes it
                logger.warning("could not retitle %s on Remote Control: %s", session.id, exc)
        if not session.capabilities.screen:
            return  # no pane to type into
        with self._lock:
            self.waiting[session.id] = _line(name)
        self.flush()

    def flush(self) -> None:
        """Blocking. Each rename waiting for a session now idle at its input box, typed in."""
        with self._lock:
            waiting = dict(self.waiting)
        for session_id, name in waiting.items():
            session = self.directory.find(session_id)
            if session is None or session.archived_at:
                self._done(session_id, name)
                continue
            if session.state != AgentState.IDLE or session.needs_attention or session.pending is not None:
                continue  # at work, or a dialog up: later
            try:
                self.directory.send_input(session_id, SendInput(text=f"/rename {name}", enter=True))
            except Exception as exc:  # noqa: BLE001 - tried again on the next change
                logger.warning("could not rename %s in Claude Code: %s", session_id, exc)
                continue
            self._done(session_id, name)

    def _done(self, session_id: str, name: str) -> None:
        with self._lock:
            if self.waiting.get(session_id) == name:  # not renamed again meanwhile
                del self.waiting[session_id]

    async def run_loop(self, bus: EventBus) -> None:
        queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        bus.subscribe("sessions", queue)
        bus.subscribe("attention:*", queue)
        while True:
            await queue.get()
            await asyncio.sleep(SETTLE_SECONDS)
            while not queue.empty():
                queue.get_nowait()
            if self.waiting:
                try:
                    await asyncio.to_thread(self.flush)
                except Exception:
                    logger.exception("could not rename sessions in Claude Code")
