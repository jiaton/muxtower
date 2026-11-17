"""Archiving a session: ending it wherever it runs, then keeping it to read (`SessionArchive`), with what
starts it again (`relaunch_of`, `recovery/`)."""

import json

from muxtower.sessions.archive import SessionArchive
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.endable import ends_when_archived
from muxtower.sessions.interrupted import agent_id_of
from muxtower.sessions.ports import SessionRecord

ARCHIVED_ITEMS = 400  # of a conversation that has no transcript, kept when it is archived


def relaunch_of(record: SessionRecord | None, transcript: str | None) -> str | None:
    """What starts an archived session again: its options, the agent's own id (else from its transcript's
    name), how it was named, when it started. None for a session muxtower does not run here."""
    if record is None:
        return None
    return json.dumps({
        "launch_args": record.launch_args,
        "agent_id": record.agent_id or agent_id_of(transcript),
        "named": record.named,
        "named_at": record.named_at.isoformat() if record.named_at else None,
        "auto_approve": record.auto_approve,
        "created_at": record.created_at.isoformat(),
    })  # fmt: skip


class Archiver:
    def __init__(self, directory: SessionDirectory, archive: SessionArchive) -> None:
        self.directory = directory
        self.archive_store = archive

    def archive(self, session_id: str) -> bool:
        """On Remote Control archived there first (if that fails, nothing has changed), then ended where
        it runs (its tmux pane closed, here or on its node), its conversation kept: the transcript it
        was read from, else the items it had. True; False for a session muxtower cannot end (Claude's
        desktop app's, `endable.py`), which is only hidden here, and not archived on Remote Control."""
        directory = self.directory
        session = directory.require(session_id, "archive")
        if not ends_when_archived(session):
            directory.hide(session.id, True)
            return False
        own = directory.source_of(session.id)
        transcript = directory.local.transcript_of(session.id) if own is None else None
        if transcript is None and own is None and session.interrupted_at:
            # Its agent is not running: its transcript found by the conversation's own id, if it is here.
            record = directory.local.repo.get(session.id)
            ask = getattr(directory.processes, "transcript_for", None)
            transcript = ask(record.agent_id) if ask and record and record.agent_id else None
        items = None
        if transcript is None and session.capabilities.conversation:
            items = directory.conversation(session.id, 0, ARCHIVED_ITEMS).items
        # Remote Control first; then where it runs: a source's own session (a node's, Codex's), or tmux here.
        # A node's session that also runs Remote Control is archived there too: its node has no Remote
        # Control to do it.
        for remote_id in dict.fromkeys(filter(None, (session.remote_id, None if own is None else session.id))):
            if remote := directory.source_of(remote_id):
                remote.archive(remote_id)
        relaunch = relaunch_of(directory.local.repo.get(session.id), transcript) if own is None else None
        if own is None:
            directory.local.close(session.id)
        self.archive_store.keep(session, transcript, items, relaunch)
        return True
