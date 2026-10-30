"""What the owner marks on a session, the same for every source: hidden, pinned, which pushes it sends,
read or unread (read is passed on to the Claude apps too, best effort). Part of `SessionDirectory`."""

import logging

from muxtower.errors import Unavailable
from muxtower.sessions.marks import SessionMarks
from muxtower.sessions.models import NotifyLevel, Session
from muxtower.sessions.ports import SessionSourcePort

logger = logging.getLogger("muxtower.sessions")


class OwnerMarks:
    marks: SessionMarks | None

    def get(self, session_id: str) -> Session:
        raise NotImplementedError

    def source_of(self, session_id: str) -> SessionSourcePort | None:
        raise NotImplementedError

    def hide(self, session_id: str, hidden: bool) -> None:
        """Out of the lists (or back in), for every source."""
        session = self.get(session_id)
        if self.marks is not None:
            self.marks.hide(session.id, hidden)

    def pin(self, session_id: str, pinned: bool) -> None:
        """Above the others in the lists (or back among them), for every source."""
        session = self.get(session_id)
        if self.marks is not None:
            self.marks.pin(session.id, pinned)

    def set_notify(self, session_id: str, level: NotifyLevel) -> Session:
        """Which push notifications it sends, for every source."""
        session = self.get(session_id)
        if self.marks is not None:
            self.marks.set_notify(session.id, level.value)
        return self.get(session_id)

    def mark_read(self, session_id: str, read: bool) -> None:
        """Read: the owner looked at it, here and (best effort) in the Claude apps. Unread: to come back to."""
        session = self.get(session_id)
        if self.marks is None:
            return
        if not read:
            self.marks.mark_unread(session.id)
            return
        self.marks.seen(session.id)
        remote_id = session.remote_id or session.id
        source = self.source_of(remote_id)
        if source is not None and source.get(remote_id).unread:  # clients repeat this; ask only when needed
            try:
                source.mark_read(remote_id)
            except Unavailable as exc:
                logger.warning("could not mark %s read on its source: %s", remote_id, exc)
