"""All sessions, whatever their source: local tmux sessions plus optional remote sources."""

from muxtower.errors import NotFound
from muxtower.sessions.models import Session
from muxtower.sessions.service import SessionService
from muxtower.sources.remote_control.service import RemoteControlSource


class SessionDirectory:
    def __init__(self, local: SessionService, remote: RemoteControlSource | None) -> None:
        self.local = local
        self.remote = remote

    def list(self) -> list[Session]:
        return self.local.list() + (self.remote.views() if self.remote else [])

    def remote_for(self, session_id: str) -> RemoteControlSource | None:
        return self.remote if self.remote is not None and self.remote.owns(session_id) else None

    def get(self, session_id: str) -> Session:
        remote = self.remote_for(session_id)
        return remote.get(session_id) if remote else self.local.get(session_id)

    def find(self, session_id: str) -> Session | None:
        try:
            return self.get(session_id)
        except NotFound:
            return None
