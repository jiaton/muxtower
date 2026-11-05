"""Whether muxtower can end a session, so that archiving it means what it says. It can end what runs in a
tmux pane it reaches (here or on a node; one that also runs Remote Control too), what it runs headless
(Codex), a Codex app-server thread, and a Remote Control session in Anthropic's cloud (archived there, it
stops). It cannot end a session it sees only through Remote Control that runs elsewhere: in Claude's
desktop app (which does not follow claude.ai's archive: the session stays there, and may go on working),
or in a terminal no muxtower watches. Such a session is only hidden here."""

from muxtower.sessions.models import Session
from muxtower.sessions.ports import SessionSource

CLOUD = "cloud"  # the machine of a Remote Control session in Anthropic's cloud (`remote_control/view.py`)


def ends_when_archived(session: Session) -> bool:
    if session.source != SessionSource.REMOTE_CONTROL:
        return True
    return session.machine == CLOUD


def where_it_runs(session: Session) -> str:
    """Where a session muxtower cannot end runs, for telling the owner."""
    if session.origin == "claude_desktop":
        return "the Claude desktop app"
    return (
        f"a Claude Code muxtower does not run ({session.machine})"
        if session.machine
        else "a Claude Code muxtower does not run"
    )
