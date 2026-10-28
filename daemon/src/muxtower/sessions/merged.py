"""One entry for an agent reached two ways: a tmux pane here whose Claude Code also runs Remote Control."""

from muxtower.sessions.models import PendingAction, Session


def deeper(start: str, working: str) -> str:
    """Where an agent works: the folder it started in, or the folder it works in when that lies inside
    (an agent started in ~/projects that works in ~/projects/web belongs to web)."""
    if start and working.startswith(start.rstrip("/") + "/"):
        return working
    return start or working


def with_detail(local: Session, remote: Session) -> PendingAction | None:
    """What the pane waits on, with the tool and command the remote side heard asked for, when the pane's
    own dialog has only its choices (no hooks)."""
    pending, asked = local.pending, remote.pending
    if pending is None or asked is None or not asked.options or pending.state != asked.state or pending.detail:
        return pending
    return pending.model_copy(update={"tool_name": pending.tool_name or asked.tool_name, "detail": asked.detail})


def merged(local: Session, remote: Session) -> Session:
    """The tmux entry, with the remote side's name, conversation, summary and origin."""
    return local.model_copy(
        update={
            "pending": with_detail(local, remote),
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
