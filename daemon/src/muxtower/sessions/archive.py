"""Archived sessions: ended by the owner, kept to read.

Archiving ends the agent (its tmux pane closes; a Remote Control session is archived there too) and
keeps its last view and where its conversation can be read: the Claude Code transcript when there is
one (the file stays after the process ends), else the conversation as it was then. An archived session
is listed under Archived only, read-only; deleting it there forgets it (a transcript file is left alone).

Archived on Remote Control is only filed away: the app it runs in (Claude Desktop) keeps it, and written
to there it is active again. One listed again with something newer than its archiving is taken back out
of the archive (`revive`), so it is listed where it runs instead of missing.

Kept in memory, written through to SQLite.
"""

import json
import logging
import threading
from collections.abc import Callable, Iterable
from datetime import UTC, datetime, timedelta

from muxtower.errors import Conflict
from muxtower.runtimes.models import AgentState
from muxtower.sessions.models import Capabilities, Conversation, ConversationItem, Session, StateSource
from muxtower.sessions.ports import ArchiveRecord, ArchiveRepository
from muxtower.sessions.transcripts import Transcripts

logger = logging.getLogger("muxtower.archive")

READ_ONLY = Capabilities(screen=False, conversation=False, keys=[], resize=False, terminate=True, rename=False)


def _view(record: ArchiveRecord) -> Session:
    """Its last view, at rest: nothing runs, waits or can be typed into any more."""
    readable = record.transcript is not None or record.items is not None
    return Session.model_validate_json(record.session).model_copy(
        update={
            "capabilities": READ_ONLY.model_copy(update={"conversation": readable}),
            "archived_at": record.archived_at,
            "tmux_socket": None,
            "tmux_session": None,
            "tmux_pane": None,
            "remote_id": None,
            "alt_screen": False,
            "terminal_attached": False,
            "unread": False,
            "hidden": False,
            "pinned": False,
            "state": AgentState.IDLE,
            "state_source": StateSource.DEFAULT,
            "matched_rule": None,
            "needs_attention": False,
            "pending": None,
            "auto_approve": False,
            "can_auto_approve": False,
        }
    )


class SessionArchive:
    def __init__(
        self, repo: ArchiveRepository, transcripts: Transcripts | None = None,
        hide_after_days: Callable[[], int] = lambda: 0,
    ) -> None:  # fmt: skip
        self.repo = repo
        self.hide_after_days = hide_after_days
        self.transcripts = transcripts
        self._lock = threading.Lock()
        self._records = {r.session_id: r for r in repo.list()}

    def ended(self) -> set[str]:
        """What live lists leave out: archived sessions, and the Remote Control sessions they were, while a
        source still lists them (until its next poll)."""
        with self._lock:
            return {i for r in self._records.values() for i in (r.session_id, r.remote_id) if i}

    def revive(self, listed: Iterable[Session]) -> None:
        """Out of the archive: each archived session a source lists again, used since it was archived."""
        with self._lock:
            by_id = {i: r for r in self._records.values() for i in (r.session_id, r.remote_id) if i}
            used = {
                record.session_id
                for session in listed
                if (record := by_id.get(session.id)) and session.updated_at and session.updated_at > record.archived_at
            }
        for session_id in used:
            logger.info("session %s was used again since it was archived: listed again", session_id)
            self.delete(session_id)

    def views(self) -> list[Session]:
        """What the Archived list shows: those archived within `hide_after_days` (0: all). The others are
        kept (and open by id), just no longer listed."""
        with self._lock:
            records = list(self._records.values())
        days = self.hide_after_days()
        if days > 0:
            since = datetime.now(UTC) - timedelta(days=days)
            records = [r for r in records if r.archived_at >= since]
        return [_view(r) for r in records]

    def get(self, session_id: str) -> Session | None:
        with self._lock:
            record = self._records.get(session_id)
        return _view(record) if record else None

    def conversation(self, session_id: str, after: int, limit: int) -> Conversation:
        with self._lock:
            record = self._records.get(session_id)
        if record is None:
            raise Conflict("this session is not archived")
        if record.transcript and self.transcripts:
            return self.transcripts.conversation(session_id, record.transcript, after, limit)
        items = [ConversationItem.model_validate(i) for i in json.loads(record.items or "[]")]
        newer = [i for i in items if i.seq > after]
        page = newer[-limit:] if after == 0 else newer[:limit]
        return Conversation(session_id=session_id, items=page, latest_seq=max((i.seq for i in items), default=0))

    def keep(self, session: Session, transcript: str | None, items: list[ConversationItem] | None) -> None:
        """Keeps an ended session: its view, and its transcript or else its conversation items."""
        record = ArchiveRecord(
            session_id=session.id,
            remote_id=session.remote_id,
            session=session.model_dump_json(),
            transcript=transcript,
            items=None if transcript or items is None else json.dumps([i.model_dump(mode="json") for i in items]),
            archived_at=datetime.now(UTC),
        )
        self.repo.add(record)
        with self._lock:
            self._records[session.id] = record

    def delete(self, session_id: str) -> None:
        self.repo.delete(session_id)
        with self._lock:
            self._records.pop(session_id, None)
