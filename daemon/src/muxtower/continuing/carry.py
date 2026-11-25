"""What a Remote Control session continued in a terminal keeps as the pane session it now is: listed once
(its Remote Control id is the pane session's from now on, as a former bridge's is: `note_remote_ids`), under
its name (given at the start: `--name`), with its project, role and note, the names it went by, its marks
(hidden, pinned, pushes, auto-read, read or unread) and its place in the owner's chip groups. Kept on the hub,
which lists every machine's sessions under these ids."""

from collections.abc import Callable

from muxtower.chips.service import ChipGroupStore
from muxtower.continuing.ports import Job
from muxtower.sessions.marks import SessionMarks
from muxtower.sessions.models import Session
from muxtower.sessions.ports import SessionRepository
from muxtower.teams.service import TeamService


class CarryOver:
    def __init__(
        self, repo: SessionRepository, marks: SessionMarks | None, teams: TeamService, chips: ChipGroupStore,
        changed: Callable[[str], None] = lambda topic: None,
    ) -> None:  # fmt: skip
        self.repo, self.marks, self.teams, self.chips, self.changed = repo, marks, teams, chips, changed

    def __call__(self, job: Job, started: Session) -> None:
        old, new = job.remote_id, started.id
        self.repo.note_remote_ids(new, [old])
        if self.marks is not None:
            self.marks.carry(old, new, job.unread)
        self.teams.carried(old, new, job.agent_id)
        if self.chips.replace_session(old, new):
            self.changed("chip-groups")
