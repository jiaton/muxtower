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
        # Its own source (a node keeps marks of its own, and says unread by them) and its controller's (the
        # Claude apps' flag): each that still calls it unread. Clients repeat this; ask only when needed.
        for source_id in dict.fromkeys([session.id, session.remote_id or session.id]):
            source = self.source_of(source_id)
            if source is None or not source.get(source_id).unread:
                continue
            try:
                source.mark_read(source_id)
            except Unavailable as exc:
                logger.warning("could not mark %s read on its source: %s", source_id, exc)
