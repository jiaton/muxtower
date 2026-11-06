"""What the owner does to a Remote Control session: answer its prompt, write to it, interrupt it, mark it
read, archive it, find its folder. Each acts on Remote Control at once; the cache follows at the next
poll, or right away where the answer depends on it (a prompt is answered from a fresh read of the log)."""

import threading

from muxtower.claude_conversation import PendingRequest
from muxtower.errors import Conflict
from muxtower.runtimes.models import AgentState
from muxtower.sessions.models import ConversationItem, Session
from muxtower.sources.remote_control import prompts
from muxtower.sources.remote_control.folder import WorkingFolder
from muxtower.sources.remote_control.ports import RemoteControlPort
from muxtower.sources.remote_control.view import KEYS, RcSession
from muxtower.terminal.models import ImageInput

EVENTS_PER_PAGE = 200
MAX_DETECT_PAGES = 50  # of a whole log read for its folder, on the owner's request


class RcActions:
    """Mixed into `RemoteControlSource`, which holds the cache and reads it."""

    port: RemoteControlPort
    sessions: dict[str, RcSession]
    _lock: threading.Lock
    _unsent: dict[str, list[ConversationItem]]

    def get(self, session_id: str) -> Session:
        raise NotImplementedError

    def _session(self, session_id: str) -> RcSession:
        raise NotImplementedError

    def _refresh(self, session_id: str) -> None:
        raise NotImplementedError

    def _answerable(self, session_id: str) -> tuple[PendingRequest, Session]:
        """The prompt to answer, from a fresh read of the log: it may be answered or withdrawn by now."""
        self._refresh(session_id)
        with self._lock:
            rc = self._session(session_id)
            request = rc.builder.pending
            if request is None or not rc.waiting or rc.view is None:
                raise Conflict("nothing to answer: the session is not waiting on a prompt")
            return request, rc.view

    def approve(
        self, session_id: str, option: str | None, answers: list[list[str]] | None = None
    ) -> tuple[AgentState, str]:
        request, view = self._answerable(session_id)
        return prompts.approve(self.port, session_id, request, view, option, answers)

    def deny(self, session_id: str) -> AgentState:
        request, view = self._answerable(session_id)
        return prompts.deny(self.port, session_id, request, view)

    def send_text(self, session_id: str, text: str, images: list[ImageInput] | None = None) -> None:
        self.get(session_id)
        self.port.send_message(session_id, text, images or [])

    def mark_read(self, session_id: str) -> None:
        self.get(session_id)
        self.port.mark_read(session_id)

    def detect_folder(self, session_id: str) -> str | None:
        """The folder its whole log names (the cache holds its latest events only): what its tool calls
        say they ran in. None when they say nothing."""
        self.get(session_id)
        folder, seq = WorkingFolder(), 0
        for _ in range(MAX_DETECT_PAGES):
            page = self.port.events_after(session_id, seq, EVENTS_PER_PAGE)
            folder.feed(page)
            if len(page) < EVENTS_PER_PAGE:
                break
            seq = max(e.seq for e in page)
        return folder.cwd or None

    def rename(self, session_id: str, title: str) -> None:
        """Retitled on Remote Control (claude.ai lists it so, and its Claude Code takes the title)."""
        self.get(session_id)
        self.port.rename_session(session_id, title)

    def archive(self, session_id: str) -> None:
        """Archived on Remote Control (which ends its agent), and out of this cache at once rather than
        at the next poll."""
        self.get(session_id)
        self.port.archive_session(session_id)
        with self._lock:
            self.sessions.pop(session_id, None)
            self._unsent.pop(session_id, None)

    def send_key(self, session_id: str, key: str) -> None:
        self.get(session_id)
        if key not in KEYS:
            raise Conflict("this session only takes Escape (interrupt) as a key")
        self.port.interrupt(session_id)
