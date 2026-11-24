"""The owner's groups of projects, which the app shows as its second row of chips: a name, the projects it
holds whole (project names as the app reads them from its sessions, or OTHER, sessions to come included)
and single sessions besides (their ids, a fixed list), in the owner's order. Kept on
the hub, the same on every device; a node asks its hub (`HubClient.ask`). A project no session has any
more stays in its groups. A group may also hold roles (role keys, as the app reads them from a session's role:
its leading name, "PM"), each matched in every project."""

import json

from pydantic import BaseModel, Field, field_validator

from muxtower.infra.db import Database

MAX_GROUPS = 20
MAX_PROJECTS = 40  # in one group
MAX_NAME = 40  # characters of a group's name
MAX_SESSIONS = 100  # single sessions in one group
MAX_PROJECT_NAME = 200
MAX_ROLES = 20  # role keys in one group
MAX_ROLE = 80  # characters of a role key
OTHER = ":other"  # the sessions of no project: home, /, a temp folder, or no folder at all (the app's rule)


class ChipGroup(BaseModel):
    id: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=MAX_NAME)
    projects: list[str] = Field(
        max_length=MAX_PROJECTS,
        description=f"project names as the app reads them from sessions; {OTHER!r}: sessions of no project",
    )
    sessions: list[str] = Field(
        default_factory=list, max_length=MAX_SESSIONS,
        description="single sessions it holds besides whole projects: their ids as the hub lists them",
    )  # fmt: skip
    roles: list[str] = Field(
        default_factory=list, max_length=MAX_ROLES,
        description="role keys it holds in every project: a role's leading name, compared without case (\"pm\")",
    )  # fmt: skip

    @field_validator("name")
    @classmethod
    def named(cls, name: str) -> str:
        if not name.strip():
            raise ValueError("a group needs a name")
        return name.strip()

    @field_validator("projects")
    @classmethod
    def projects_named(cls, projects: list[str]) -> list[str]:
        if any(not p.strip() or len(p) > MAX_PROJECT_NAME for p in projects):
            raise ValueError(f"a project name is 1 to {MAX_PROJECT_NAME} characters")
        return list(dict.fromkeys(projects))  # each once, in the order given

    @field_validator("sessions")
    @classmethod
    def sessions_named(cls, sessions: list[str]) -> list[str]:
        if any(not s.strip() or len(s) > MAX_PROJECT_NAME for s in sessions):
            raise ValueError("a session id is 1 to 200 characters")
        return list(dict.fromkeys(sessions))

    @field_validator("roles")
    @classmethod
    def roles_named(cls, roles: list[str]) -> list[str]:
        if any(not r.strip() or len(r) > MAX_ROLE for r in roles):
            raise ValueError(f"a role is 1 to {MAX_ROLE} characters")
        return list(dict.fromkeys(r.strip().lower() for r in roles))


class ChipGroups(BaseModel):
    groups: list[ChipGroup] = Field(max_length=MAX_GROUPS, description="in the order the chips show them")

    @field_validator("groups")
    @classmethod
    def distinct(cls, groups: list[ChipGroup]) -> list[ChipGroup]:
        if len({g.id for g in groups}) != len(groups):
            raise ValueError("two groups have the same id")
        return groups


class ChipGroupStore:
    def __init__(self, db: Database) -> None:
        self.db = db

    def load(self) -> ChipGroups:
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT id, name, projects, sessions, roles FROM chip_groups ORDER BY position"
            ).fetchall()
        return ChipGroups(
            groups=[
                ChipGroup(
                    id=r["id"],
                    name=r["name"],
                    projects=json.loads(r["projects"]),
                    sessions=json.loads(r["sessions"]),
                    roles=json.loads(r["roles"]),
                )
                for r in rows
            ]
        )

    def replace(self, groups: ChipGroups) -> ChipGroups:
        with self.db.connect() as conn:
            conn.execute("DELETE FROM chip_groups")
            conn.executemany(
                "INSERT INTO chip_groups (position, id, name, projects, sessions, roles) VALUES (?, ?, ?, ?, ?, ?)",
                [
                    (i, g.id, g.name, json.dumps(g.projects), json.dumps(g.sessions), json.dumps(g.roles))
                    for i, g in enumerate(groups.groups)
                ],
            )
        return self.load()

    def rename_project(self, old: str, new: str) -> bool:
        """A project renamed (`teams/renaming.py`): every group holding it holds the new name in its place
        (once, should it hold that already). Whether any changed."""
        groups = self.load()
        changed = False
        for group in groups.groups:
            if old in group.projects:
                group.projects = list(dict.fromkeys(new if p == old else p for p in group.projects))
                changed = True
        if changed:
            self.replace(groups)
        return changed
