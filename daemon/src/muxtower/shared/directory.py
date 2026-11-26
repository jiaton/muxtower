"""Sharing a file, and reading one shared, for a session of this daemon. Part of `SessionDirectory`; a hub
reads a node's session's from its node (`nodes/directory.py`)."""

from pathlib import Path

from muxtower.errors import Conflict, Invalid
from muxtower.sessions.models import Session
from muxtower.shared.models import SharedFile
from muxtower.shared.store import SharedStore


class Sharing:
    shared: SharedStore | None = None  # set by the app

    def get(self, session_id: str) -> Session:
        raise NotImplementedError

    def turn_finished(self, session_id: str) -> None:
        raise NotImplementedError

    def _store(self) -> SharedStore:
        if self.shared is None:
            raise Conflict("this daemon keeps no shared files")
        return self.shared

    def share(self, session_id: str, path: str, caption: str | None) -> SharedFile:
        """Copies a file of this machine into the session's conversation (`share_file`): a relative path is
        taken from the folder its agent works in. Unread after it, as after a finished reply."""
        session = self.get(session_id)
        if session.archived_at:
            raise Conflict("this session is archived")
        source = Path(path).expanduser()
        if not source.is_absolute():
            folder = session.working_dir or session.cwd
            if not folder:
                raise Invalid(f"{path}: give an absolute path (this session's folder is not known)")
            source = Path(folder).expanduser() / source
        shared = self._store().share(session.id, source, caption)
        self.turn_finished(session.id)
        return shared

    def shared_file(self, session_id: str, file_id: str) -> SharedFile:
        """A file shared in this session: NotFound for one it does not have, or that expired."""
        return self._store().find(self.get(session_id).id, file_id)

    def read_shared(self, session_id: str, file_id: str, offset: int, length: int) -> bytes:
        return self._store().read(self.get(session_id).id, file_id, offset, length)
