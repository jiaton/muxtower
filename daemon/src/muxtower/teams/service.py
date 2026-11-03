"""Teams: which sessions work together (a project) and what each is for (a role), so one can find another
and hand it work without the owner saying who is who. muxtower keeps and shows them; what a role means is
the agents' business (free text, any project its own).

A session's project is worked out once, when it is first seen, from git on this machine (`checkout.py`):
its origin remote, else its repository, else its folder. An agent or the owner can move it, or rename a
project for all its sessions. Kept on the hub, which sees every session."""

import os
import re
import threading
from collections.abc import Callable
from dataclasses import dataclass, replace

from muxtower.errors import Invalid, NotFound
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.models import Session
from muxtower.teams.checkout import CheckoutCache, checkout
from muxtower.teams.ports import Checkout, TeamRecord, TeamRepository

UUID_AT_END = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
ROLE_CHARS = 60
NOTE_CHARS = 300
PROJECT_CHARS = 120


@dataclass(frozen=True)
class Member:
    session: Session
    role: str | None
    note: str | None
    project: str
    project_source: str  # set (by an agent or the owner) | git remote | git root | folder
    checkout: Checkout | None  # for a session on this machine


def _text(value: str | None, limit: int, what: str) -> str | None:
    text = " ".join((value or "").split())
    if len(text) > limit:
        raise Invalid(f"{what} is longer than {limit} characters")
    return text or None


def agent_id_of(transcript: str | None) -> str | None:
    """The agent's own id for a session, from its transcript's name (Claude Code: `<id>.jsonl`; Codex:
    `rollout-<time>-<thread id>.jsonl`)."""
    found = UUID_AT_END.search(os.path.basename(transcript or "").removesuffix(".jsonl"))
    return found.group(0) if found else None


class TeamService:
    def __init__(
        self,
        directory: SessionDirectory,
        repo: TeamRepository,
        read: Callable[[str], Checkout] = checkout,
        transcript_of: Callable[[str], str | None] | None = None,
    ) -> None:
        self.directory = directory
        self.repo = repo
        self.checkouts = CheckoutCache(read)
        self.transcript_of = transcript_of or (lambda _: None)
        self.changed: Callable[[], None] = lambda: None  # a role or project changed (the lists show them)
        self._lock = threading.Lock()
        self._records = repo.load()
        directory.team = self.kept
        directory.checkout = self.checkouts.get

    def kept(self, session_id: str) -> TeamRecord | None:
        """Its role and project as kept, without looking anything up (for every listing)."""
        with self._lock:
            return self._records.get(session_id)

    def _checkout(self, session: Session) -> Checkout | None:
        """Blocking (git, cached). Only a session whose folder is on this machine has one."""
        if not session.on_host or not session.cwd:
            return None
        return self.checkouts.get(session.cwd)

    def _known_as(self, session: Session, record: TeamRecord | None) -> TeamRecord | None:
        """Its record with the agent's own id, once that is known: a session nobody gave a role or a project
        yet that resumes one muxtower knew (by that id) takes over that one's role and project."""
        agent = agent_id_of(self.transcript_of(session.id)) if session.on_host else None
        if agent is None or (record is not None and record.agent_id == agent):
            return record
        untouched = record is None or (record.role is None and (record.project is None or record.project_auto))
        with self._lock:
            was = next((r for r in self._records.values() if r.agent_id == agent and r.session_id != session.id), None)
        if untouched and was is not None:
            record = replace(was, session_id=session.id)
        else:
            record = replace(record or TeamRecord(session.id), agent_id=agent)
        self._save(record)
        return record

    def resumed(self, session_id: str, agent_id: str) -> None:
        """A session started to resume the agent's `agent_id`: it is that one again, role and project kept."""
        with self._lock:
            was = next((r for r in self._records.values() if r.agent_id == agent_id), None)
        self._save(replace(was, session_id=session_id) if was else TeamRecord(session_id, agent_id=agent_id))

    def member(self, session: Session) -> Member:
        """Blocking (git). A session as a team sees it; its project worked out (and kept) on first sight."""
        with self._lock:
            record = self._records.get(session.id)
        record = self._known_as(session, record)
        found = self._checkout(session)
        if record is None or record.project is None:
            if found is not None:  # worked out once from git here, then kept as it is
                record = replace(record or TeamRecord(session.id), project=found.project, project_auto=True)
                self._save(record)
                source = found.source
            else:  # elsewhere: its folder, until something better says otherwise
                source, project = "folder", (session.cwd.rstrip("/").rsplit("/", 1)[-1] or session.cwd or "?")
                return Member(
                    session, record.role if record else None, record.note if record else None, project, source, None
                )
        else:
            same = found is not None and found.project == record.project
            source = ("git" if not same else found.source) if record.project_auto and found else "set"
        assert record.project is not None
        return Member(session, record.role, record.note, record.project, source, found)

    def _save(self, record: TeamRecord) -> None:
        self.repo.save(record)
        with self._lock:
            before = self._records.get(record.session_id)
            self._records[record.session_id] = record
        if before is None or (before.role, before.note, before.project) != (record.role, record.note, record.project):
            self.changed()

    def members(self) -> list[Member]:
        """Blocking. Every session that is not archived, as a team member."""
        return [self.member(s) for s in self.directory.list() if not s.archived_at]

    def set_role(self, session_id: str, role: str | None, note: str | None) -> Member:
        session = self.directory.get(session_id)
        with self._lock:
            record = self._records.get(session.id) or TeamRecord(session.id)
        self._save(
            replace(record, role=_text(role, ROLE_CHARS, "a role"), note=_text(note, NOTE_CHARS, "a role's note"))
        )
        return self.member(session)

    def set_project(self, session_id: str, project: str, rename: bool = False) -> tuple[Member, int]:
        """Moves the session to `project`, or (`rename`) renames its project for all its sessions; returns the
        session and how many sessions moved."""
        name = _text(project, PROJECT_CHARS, "a project name")
        if name is None:
            raise Invalid("a project needs a name")
        session = self.directory.get(session_id)
        current = self.member(session)
        if not rename:
            with self._lock:
                record = self._records.get(session.id) or TeamRecord(session.id)
            self._save(replace(record, project=name, project_auto=False))
            return self.member(session), 1
        moved = [m for m in self.members() if m.project == current.project]
        for m in moved:  # kept for each: one only worked out from its folder is kept from now on too
            with self._lock:
                record = self._records.get(m.session.id) or TeamRecord(m.session.id)
            self._save(replace(record, project=name, project_auto=False))
        self.repo.rename_project(current.project, name)  # also the archived ones
        with self._lock:
            for record in self._records.values():
                if record.project == current.project:
                    record.project, record.project_auto = name, False
        return self.member(session), len(moved)

    def find(self, session_id: str) -> Member:
        try:
            return self.member(self.directory.get(session_id))
        except NotFound:
            raise NotFound(f"no session {session_id}") from None
