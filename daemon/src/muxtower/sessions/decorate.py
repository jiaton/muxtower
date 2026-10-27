"""What the sources leave open about a session, filled in by the directory that lists it (pure)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from muxtower.sessions.merged import deeper
from muxtower.sessions.models import NotifyLevel, Placement, Session, SessionRole
from muxtower.sessions.ports import SessionSource

if TYPE_CHECKING:
    from muxtower.sessions.directory import SessionDirectory


def decorate(session: Session, directory: SessionDirectory) -> Session:
    """The machine, folder and origin of everything that runs on this daemon, the account it runs as,
    the owner's marks (unread, hidden, where they placed it, which pushes it sends), the reply summary,
    the concierge role. A node's session keeps where its node says it runs and as whom."""
    d = directory
    update: dict[str, object] = {}
    marks = d.marks.get(session.id) if d.marks else None
    if d.marks and marks:
        update["unread"] = d.marks.unread(session.id, session.unread, session.updated_at)
        update["finished_at"] = marks.finished_at
        update["hidden"] = marks.hidden
        update["notify"] = NotifyLevel(marks.notify)
    if session.node is None:
        if session.source != SessionSource.REMOTE_CONTROL:
            update.update(machine=d.hub_name or session.machine, on_host=True)
        elif d.processes and (process := d.processes.running().get(session.id)):
            update.update(machine=d.hub_name or session.machine, on_host=True)
            update["cwd"] = deeper(process.cwd, session.cwd)
            update["origin"] = process.origin or session.origin  # what Claude Code says beats the tags
        if d.accounts and (account := d.accounts(session)):
            update["account"] = account
    if d.summaries and (summary := d.summaries.lookup(session.last_message)):
        update["reply_summary"] = summary
    if marks and (marks.machine or marks.folder):  # the owner knows best
        update["placement"] = Placement(machine=marks.machine, folder=marks.folder)
        update["machine"] = marks.machine or update.get("machine", session.machine)
        update["cwd"] = marks.folder or update.get("cwd", session.cwd)
    if d.concierge_id and session.id == d.concierge_id:
        update["role"] = SessionRole.CONCIERGE
        update["capabilities"] = session.capabilities.model_copy(update={"archive": False})  # it is restarted
    return session.model_copy(update=update) if update else session
