"""The owner's team playbook: how their agent teams work together, in their own words, kept on the hub for
every machine and project. One shared playbook, and per project either additions to it or a replacement.
Every save is a new version (history; a revert saves an old one again). Sessions read the playbook that
applies to them at the top of `my_team` (`read_playbook` for all of it). muxtower ships it empty and
assumes nothing about how a team is made up.

A node keeps none: it asks its hub (`nodes/asked.py`)."""

import threading
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field

from muxtower.errors import Conflict, Invalid, NotFound
from muxtower.infra.db import Database

SHARED = "shared"
PROJECTS = "projects/"  # a project's scope: projects/<its name>
MAX_TEXT = 20_000
INLINE = 1_500  # what my_team shows of it before pointing at read_playbook

Mode = Literal["add", "replace"]


class PlaybookPart(BaseModel):
    scope: str = Field(description='"shared", or "projects/<project>"')
    mode: Mode = Field(description="a project's: added to the shared playbook, or replacing it")
    version: int = Field(description="0: never saved")
    text: str
    at: datetime | None = None
    author: str | None = None


class PlaybookVersion(PlaybookPart):
    note: str | None = None


class Playbook(BaseModel):
    shared: PlaybookPart
    projects: list[PlaybookPart] = Field(description="projects with additions or a replacement")
    effective: list[PlaybookPart] | None = Field(
        default=None, description="what a session of `effective_for` reads, in order (`?effective_for=`)"
    )


class PutPlaybook(BaseModel):
    text: str = Field(max_length=MAX_TEXT, description="Markdown or plain text; empty: none")
    mode: Mode = "add"
    base_version: int = Field(ge=0, description="the version this edit started from: 409 when another came since")
    note: str | None = Field(default=None, max_length=200)


class Revert(BaseModel):
    version: int = Field(ge=1)


def scope_of(project: str | None) -> str:
    return f"{PROJECTS}{project}" if project else SHARED


def _check(scope: str) -> str:
    if scope != SHARED and not (scope.startswith(PROJECTS) and scope.removeprefix(PROJECTS).strip()):
        raise Invalid('a playbook is "shared" or "projects/<project>"')
    return scope


def _label(part: PlaybookPart) -> str:
    if part.scope == SHARED:
        return f"shared (v{part.version})"
    how = "adds" if part.mode == "add" else "replaces the shared one"
    return f"{part.scope.removeprefix(PROJECTS)} {how} (v{part.version})"


def render(parts: list[PlaybookPart], limit: int | None = None) -> str:
    """The playbook a session reads, each part marked where it comes from; cut at `limit` characters, at a
    line, with what is left said. Empty when there is none."""
    if not parts:
        return ""
    lines = ["Team playbook (the owner's: how their teams work; follow it):"]
    for part in parts:
        lines += [f"— {_label(part)} —", *part.text.strip().splitlines()]
    if limit is None or sum(len(line) + 1 for line in lines) <= limit:
        return "\n".join(lines)
    kept: list[str] = []
    for line in lines:
        if sum(len(k) + 1 for k in kept) + len(line) > limit:
            break
        kept.append(line)
    left = len(lines) - len(kept)
    return "\n".join([*kept, f"… {left} more line{'s' if left != 1 else ''}: read_playbook for all of it"])


class PlaybookStore:
    def __init__(self, db: Database) -> None:
        self.db = db
        self._lock = threading.Lock()

    def _part(self, scope: str) -> PlaybookPart:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM playbooks WHERE scope = ?", (scope,)).fetchone()
        if row is None:
            return PlaybookPart(scope=scope, mode="add", version=0, text="")
        return PlaybookPart(
            scope=scope, mode=row["mode"], version=row["version"], text=row["text"],
            at=datetime.fromisoformat(row["at"]), author=row["author"],
        )  # fmt: skip

    def projects(self) -> list[PlaybookPart]:
        with self.db.connect() as conn:
            scopes = [r["scope"] for r in conn.execute("SELECT scope FROM playbooks WHERE scope LIKE 'projects/%'")]
        parts = [self._part(s) for s in sorted(scopes)]
        return [p for p in parts if p.text.strip() or p.mode == "replace"]

    def effective(self, project: str | None) -> list[PlaybookPart]:
        """What a session of `project` reads: the shared playbook, then the project's additions; or only the
        project's own, when it replaces the shared one. Empty parts are left out."""
        shared = self._part(SHARED)
        own = self._part(scope_of(project)) if project else None
        if own is not None and own.mode == "replace" and own.version:
            return [own] if own.text.strip() else []
        return [p for p in (shared, own) if p is not None and p.text.strip()]

    def get(self, effective_for: str | None = None) -> Playbook:
        return Playbook(
            shared=self._part(SHARED), projects=self.projects(),
            effective=self.effective(effective_for) if effective_for is not None else None,
        )  # fmt: skip

    def put(self, scope: str, body: PutPlaybook, author: str) -> PlaybookPart:
        """Saves a new version; Conflict when another was saved since `base_version`."""
        scope = _check(scope)
        with self._lock:
            now = self._part(scope)
            if body.base_version != now.version:
                raise Conflict(
                    f"the playbook was changed since (now version {now.version}, yours started from "
                    f"{body.base_version}): reload it and edit again"
                )
            return self._save(
                scope, body.text, "add" if scope == SHARED else body.mode, now.version + 1, author, body.note
            )

    def versions(self, scope: str) -> list[PlaybookVersion]:
        """Every version of a playbook, newest first."""
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM playbook_versions WHERE scope = ? ORDER BY version DESC", (_check(scope),)
            ).fetchall()
        return [
            PlaybookVersion(
                scope=r["scope"], mode=r["mode"], version=r["version"], text=r["text"],
                at=datetime.fromisoformat(r["at"]), author=r["author"], note=r["note"],
            )
            for r in rows
        ]  # fmt: skip

    def revert(self, scope: str, version: int, author: str) -> PlaybookPart:
        """Saves an old version again, as the newest (nothing is rewritten)."""
        old = next((v for v in self.versions(scope) if v.version == version), None)
        if old is None:
            raise NotFound(f"no version {version} of the {scope} playbook")
        with self._lock:
            now = self._part(scope)
            return self._save(scope, old.text, old.mode, now.version + 1, author, f"reverted to v{version}")

    def _save(self, scope: str, text: str, mode: str, version: int, author: str, note: str | None) -> PlaybookPart:
        at = datetime.now(UTC).isoformat()
        with self.db.connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO playbooks (scope, mode, version, text, at, author) VALUES (?, ?, ?, ?, ?, ?)",
                (scope, mode, version, text, at, author),
            )
            conn.execute(
                "INSERT INTO playbook_versions (scope, version, mode, text, at, author, note)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                (scope, version, mode, text, at, author, note),
            )
        return self._part(scope)
