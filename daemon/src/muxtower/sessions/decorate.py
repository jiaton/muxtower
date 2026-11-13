"""What the sources leave open about a session, filled in by the directory that lists it (pure)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from muxtower.sessions.merged import deeper
from muxtower.sessions.models import GitPlace, NotifyLevel, Placement, Session, SessionRole
from muxtower.sessions.ports import SessionSource

if TYPE_CHECKING:
    from muxtower.sessions.directory import SessionDirectory


def decorate(session: Session, directory: SessionDirectory) -> Session:
    """The machine, folder and origin of everything that runs on this daemon, the account it runs as,
    the owner's marks (unread, hidden, pinned, where they placed it, which pushes it sends), the reply summary,
    the concierge role. A node's session keeps where its node says it runs and as whom."""
    d = directory
    update: dict[str, object] = {}
    marks = d.marks.get(session.id) if d.marks else None
    if d.marks and marks:
        # About the agent's output since the owner looked, not any event (a restart reconnects things).
        update["unread"] = d.marks.unread(session.id, session.unread, session.output_at or session.updated_at)
        update["finished_at"] = marks.finished_at
        update["hidden"] = marks.hidden
        update["pinned"] = marks.pinned
        update["notify"] = NotifyLevel(marks.notify)
    if session.node is None:
        if session.source != SessionSource.REMOTE_CONTROL:
            update.update(machine=d.hub_name or session.machine, on_host=True)
        elif d.processes and (process := d.processes.running().get(session.id)):
            # Its process is here, or on a node (which says so without listing it: `nodes/processes.py`).
            here = process.machine is None
            update.update(machine=process.machine or d.hub_name or session.machine, on_host=here)
            # Listed where it started (its process's folder), however far its agent went in since.
            update["cwd"] = process.cwd or session.cwd
            update["working_dir"] = deeper(process.cwd, session.cwd) or session.working_dir
            update["origin"] = process.origin or session.origin  # what Claude Code says beats the tags
            if process.git and not here:  # read on its node, which runs git where the folder is
                update["git"] = process.git
        if d.accounts and (account := d.accounts(session)):
            update["account"] = account
    if d.summaries and (summary := d.summaries.lookup(session.last_message)):
        update["reply_summary"] = summary
    if marks and (marks.machine or marks.folder):  # the owner knows best
        update["placement"] = Placement(machine=marks.machine, folder=marks.folder)
        update["machine"] = marks.machine or update.get("machine", session.machine)
        update["cwd"] = marks.folder or update.get("cwd", session.cwd)
    if d.team and (team := d.team(session.id)):  # kept on the hub; a node's own say is kept otherwise
        update.update(team_role=team.role, team_note=team.note, project=team.project, project_auto=team.project_auto)
        if team.project is not None:
            update["project_source"] = team.project_source if team.project_auto else "set"
    here = bool(update.get("on_host", session.on_host))
    cwd = update.get("cwd", session.cwd)
    if d.checkout and here and isinstance(cwd, str) and cwd and (found := d.checkout(cwd)).repo and found.root:
        update["git"] = GitPlace(repo=found.repo, worktree=found.root, branch=found.branch, remote=found.remote)
    if update.get("project_auto") and update.get("project_source") is None:  # worked out before it was kept
        update["project_source"] = _guessed_source(str(update.get("project")), session.cwd)
    if d.writing and session.node is None and not session.archived_at and (writing := d.writing(session.id)):
        update["also_writing"] = writing
    if d.concierge_id and session.id == d.concierge_id:
        update["role"] = SessionRole.CONCIERGE
        update["capabilities"] = session.capabilities.model_copy(update={"archive": False})  # it is restarted
    return session.model_copy(update=update) if update else session


def _guessed_source(project: str, cwd: str) -> str:
    """Where a project worked out before its source was kept came from, by its name: `owner/repo` is a
    remote's; the name of the folder it started in, that folder; else a repository's top folder."""
    if "/" in project:
        return "git remote"
    return "folder" if project == (cwd.rstrip("/").rsplit("/", 1)[-1] or cwd) else "git root"
