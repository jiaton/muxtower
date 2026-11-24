"""Each project's colour in the app: one of `HUES` soft hues (the app's `--color-project-N`), by project name as
the app reads it from its sessions (`project_of`). Kept on the hub, the same on every device; a node asks its
hub (`HubClient.ask`).

The hub gives a project its hue the first time it lists one of its sessions (`see`): the hue fewest projects
have, the lowest of those on a tie. It is never given again: not when projects come or go, only when the owner
picks another (`choose`). Hues are given in one transaction under a lock, so two projects seen at once never
both take the same "fewest"."""

import threading
from collections import Counter
from collections.abc import Iterable

from pydantic import BaseModel, Field, field_validator

from muxtower.chips.service import MAX_PROJECT_NAME
from muxtower.errors import Invalid
from muxtower.infra.db import Database
from muxtower.sessions.models import Session

HUES = 6  # the app's project hues, 1 to 6


class ProjectColours(BaseModel):
    hues: dict[str, int] = Field(description="each project's hue, 1 to 6, by name; a project not here has none yet")


class ProjectColour(BaseModel):
    project: str = Field(min_length=1, max_length=MAX_PROJECT_NAME)
    hue: int = Field(ge=1, le=HUES, description="one of the app's project hues, 1 to 6")

    @field_validator("project")
    @classmethod
    def named(cls, project: str) -> str:
        if not project.strip():
            raise ValueError("a project name is not blank")
        return project


def _folder_name(folder: str) -> str:
    parts = [p for p in folder.split("/") if p]
    return parts[-1] if parts else folder


def project_of(session: Session) -> str | None:
    """The project the app groups a session under (its `projectGroupOf`): one someone set or git gave, else
    its repository (its remote's owner/repo, else its main folder's name); None for neither."""
    if session.project and session.project_source != "folder":
        return session.project
    if session.git:
        return session.git.remote or _folder_name(session.git.repo)
    return None


def least_used(used: Iterable[int]) -> int:
    """The hue fewest projects have; the lowest of those on a tie."""
    counts = Counter(used)
    return min(range(1, HUES + 1), key=lambda hue: (counts[hue], hue))


class ProjectColourStore:
    def __init__(self, db: Database) -> None:
        self.db = db
        self._lock = threading.Lock()  # one assignment at a time (the database's own lock is per statement batch)
        self._known: set[str] = set()  # projects known to have a hue: most lists add none, and read nothing

    def load(self) -> ProjectColours:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT project, hue FROM project_colours ORDER BY project").fetchall()
        return ProjectColours(hues={r["project"]: r["hue"] for r in rows})

    def see(self, projects: Iterable[str]) -> list[str]:
        """Gives each project that has no hue yet its own (`least_used`, one after another, so the second
        counts the first); the projects given one."""
        new = {p for p in projects if p and len(p) <= MAX_PROJECT_NAME} - self._known
        if not new:
            return []
        given: list[str] = []
        with self._lock, self.db.connect() as conn:
            rows = conn.execute("SELECT project, hue FROM project_colours").fetchall()
            hues = {r["project"]: r["hue"] for r in rows}
            for project in sorted(new - hues.keys()):
                hue = least_used(hues.values())
                conn.execute("INSERT INTO project_colours (project, hue) VALUES (?, ?)", (project, hue))
                hues[project] = hue
                given.append(project)
            self._known |= hues.keys()
        return given

    def see_sessions(self, sessions: Iterable[Session]) -> list[str]:
        return self.see(p for s in sessions if (p := project_of(s)))

    def rename_project(self, old: str, new: str) -> bool:
        """A project renamed (`teams/renaming.py`): its hue moves with the name. Merged into a project that
        has a hue already, that one's stays and the old name's row goes. Whether it changed. Takes no lock of
        its own (it runs inside the rename's transaction, which holds the database's: `see` takes this
        store's lock first); `old` stays known, so a listing made before the rename gives it no hue again."""
        with self.db.connect() as conn:
            if conn.execute("SELECT 1 FROM project_colours WHERE project = ?", (old,)).fetchone() is None:
                return False
            if conn.execute("SELECT 1 FROM project_colours WHERE project = ?", (new,)).fetchone() is None:
                conn.execute("UPDATE project_colours SET project = ? WHERE project = ?", (new, old))
            else:
                conn.execute("DELETE FROM project_colours WHERE project = ?", (old,))
        self._known.add(new)
        return True

    def choose(self, chosen: ProjectColour) -> ProjectColours:
        """The owner's pick for a project, kept from now on (also for one not seen yet)."""
        if not 1 <= chosen.hue <= HUES:
            raise Invalid(f"no hue {chosen.hue}: there are {HUES}")
        with self._lock, self.db.connect() as conn:
            conn.execute(
                "INSERT INTO project_colours (project, hue) VALUES (?, ?) "
                "ON CONFLICT (project) DO UPDATE SET hue = excluded.hue",
                (chosen.project, chosen.hue),
            )
            self._known.add(chosen.project)
        return self.load()
