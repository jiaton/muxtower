"""Starting a session: in a tmux session of muxtower's own, or without a terminal in a source that runs
its runtime so (`HeadlessStarter`: Codex in muxtower's own app-server)."""

import os

from muxtower.errors import Conflict, Invalid
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.models import CreateSession, Session
from muxtower.sessions.ports import HeadlessStarter


class Launcher:
    def __init__(self, directory: SessionDirectory, starters: list[HeadlessStarter]) -> None:
        self.directory = directory
        self.starters = {s.runtime: s for s in starters}

    def headless_runtimes(self) -> set[str]:
        return set(self.starters)

    def create(self, request: CreateSession) -> Session:
        if not request.headless:
            return self.directory.local.create(request)
        runtime = self.directory.local.resolve_runtime(request.runtime).name
        starter = self.starters.get(runtime)
        if starter is None:
            raise Conflict(f"{runtime} cannot run headless here")
        cwd = os.path.abspath(os.path.expanduser(request.cwd))
        if not os.path.isdir(cwd):
            raise Invalid(f"not a directory: {cwd}")
        return self.directory.get(starter.start(cwd, request.name).id)
