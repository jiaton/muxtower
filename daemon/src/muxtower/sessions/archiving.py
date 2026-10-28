"""Archiving a session: ending it wherever it runs, then keeping it to read (`SessionArchive`)."""

from muxtower.sessions.archive import SessionArchive
from muxtower.sessions.directory import SessionDirectory

ARCHIVED_ITEMS = 400  # of a conversation that has no transcript, kept when it is archived


class Archiver:
    def __init__(self, directory: SessionDirectory, archive: SessionArchive) -> None:
        self.directory = directory
        self.archive_store = archive

    def archive(self, session_id: str) -> None:
        """On Remote Control archived there first (if that fails, nothing has changed), then ended where
        it runs (its tmux pane closed, here or on its node), its conversation kept: the transcript it
        was read from, else the items it had."""
        directory = self.directory
        session = directory.require(session_id, "archive")
        own = directory.source_of(session.id)
        transcript = directory.local.transcript_of(session.id) if own is None else None
        items = None
        if transcript is None and session.capabilities.conversation:
            items = directory.conversation(session.id, 0, ARCHIVED_ITEMS).items
        # Remote Control first; then where it runs: a source's own session (a node's, Codex's), or tmux here.
        # A node's session that also runs Remote Control is archived there too: its node has no Remote
        # Control to do it.
        for remote_id in dict.fromkeys(filter(None, (session.remote_id, None if own is None else session.id))):
            if remote := directory.source_of(remote_id):
                remote.archive(remote_id)
        if own is None:
            directory.local.close(session.id)
        self.archive_store.keep(session, transcript, items)
