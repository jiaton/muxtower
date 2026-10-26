"""One entry for an agent reached two ways: a tmux pane here whose Claude Code also runs Remote Control."""

from muxtower.sessions.models import Session


def deeper(start: str, working: str) -> str:
    """Where an agent works: the folder it started in, or the folder it works in when that lies inside
    (an agent started in ~/projects that works in ~/projects/web belongs to web)."""
    if start and working.startswith(start.rstrip("/") + "/"):
        return working
    return start or working


def merged(local: Session, remote: Session) -> Session:
    """The tmux entry, with the remote side's name, conversation, summary and origin."""
    return local.model_copy(
        update={
            "name": remote.name,
            "origin": remote.origin,
            "summary": remote.summary,
            "unread": remote.unread,
            # The remote log knows when the agent last did something; the local clock restarts with
            # the daemon.
            "updated_at": remote.updated_at,
            "cwd": deeper(local.cwd, remote.cwd),
            "last_message": local.last_message or remote.last_message,
            "capabilities": local.capabilities.model_copy(update={"conversation": True}),
        }
    )
