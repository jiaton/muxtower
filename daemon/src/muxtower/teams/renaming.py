"""An explicit project rename (`set_project` with rename, the app's Rename project) reaches everything the hub
keeps by project name, in the one transaction that renames the sessions' project (`TeamService.set_project`):

- chip groups' projects (`chips/service.py`), in their place;
- the order of projects (`chips/project_order.py`), the renamed one keeping its place;
- the project's colour (`chips/project_colours.py`): it moves with the name; merged into a project that has one,
  that one's stays;
- the project's playbook and its history (`playbook/`, scope `projects/<name>`); merged into a project that has
  one, both stay as they are;
- triggers delivering to `role@<project>` or starting sessions in it (`triggers/store.py`).

Team tasks and messages name sessions by id, and the search index, push and the audit log name no project, so
they need nothing. Only an explicit rename does this: a plain move changes the one session, and nothing is
inferred from where sessions went. All of these are tables of one SQLite database on one connection
(`infra/db.py`), so `Database.transaction` makes it one commit."""

import logging
from collections.abc import Callable
from contextlib import AbstractContextManager, nullcontext
from typing import Any, Protocol

from muxtower.infra.db import Database

logger = logging.getLogger("muxtower.teams")


class RenameStore(Protocol):
    def rename_project(self, old: str, new: str) -> Any:
        """Truthy when it changed something."""
        ...


class ProjectRenames:
    """What else a project rename reaches, given to `TeamService.renames`. The default (no stores) reaches
    nothing, in no transaction of its own (tests of the team alone)."""

    def __init__(
        self,
        db: Database | None = None,
        stores: dict[str, RenameStore] | None = None,
        publish: Callable[[str], None] = lambda topic: None,
    ) -> None:
        self.db = db
        self.stores = stores or {}  # by the bus topic told when it changed
        self.publish = publish

    def transaction(self) -> AbstractContextManager[Any]:
        return self.db.transaction() if self.db is not None else nullcontext()

    def rename(self, old: str, new: str) -> list[str]:
        """Inside `transaction`: every store renames; the topics of those that changed (an error rolls all
        of it back, the sessions' rename too)."""
        return [topic for topic, store in self.stores.items() if store.rename_project(old, new)]

    def announce(self, topics: list[str]) -> None:
        """After the commit: the apps read again what changed."""
        for topic in topics:
            self.publish(topic)
