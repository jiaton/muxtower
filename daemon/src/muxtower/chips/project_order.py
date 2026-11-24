"""The owner's order of projects in the session list grouped by project: project names as the app reads them
from its sessions, first to last. Kept on the hub, the same on every device; a node asks its hub
(`HubClient.ask`). A project no session has any more keeps its place, should it come back; one the list does
not hold yet comes after those it holds (the app puts those by name)."""

from pydantic import BaseModel, Field, field_validator

from muxtower.chips.service import MAX_PROJECT_NAME
from muxtower.infra.db import Database

MAX_ORDERED = 500  # projects in the order


class ProjectOrder(BaseModel):
    projects: list[str] = Field(
        max_length=MAX_ORDERED, description="project names, in the order the list shows their groups"
    )

    @field_validator("projects")
    @classmethod
    def named(cls, projects: list[str]) -> list[str]:
        if any(not p.strip() or len(p) > MAX_PROJECT_NAME for p in projects):
            raise ValueError(f"a project name is 1 to {MAX_PROJECT_NAME} characters")
        return list(dict.fromkeys(projects))  # each once, at its first place


class ProjectOrderStore:
    def __init__(self, db: Database) -> None:
        self.db = db

    def load(self) -> ProjectOrder:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT project FROM project_order ORDER BY position").fetchall()
        return ProjectOrder(projects=[r["project"] for r in rows])

    def replace(self, order: ProjectOrder) -> ProjectOrder:
        with self.db.connect() as conn:
            conn.execute("DELETE FROM project_order")
            conn.executemany(
                "INSERT INTO project_order (position, project) VALUES (?, ?)", list(enumerate(order.projects))
            )
        return self.load()

    def rename_project(self, old: str, new: str) -> bool:
        """A project renamed (`teams/renaming.py`): the new name takes its place; where the order held the
        new name already (a merge), that one goes. Whether it changed."""
        projects = self.load().projects
        if old not in projects:
            return False
        self.replace(ProjectOrder(projects=[new if p == old else p for p in projects if p != new]))
        return True
