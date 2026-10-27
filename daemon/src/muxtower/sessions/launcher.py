"""Starting a session: in a tmux session of muxtower's own, or without a terminal in a source that runs
its runtime so (`HeadlessStarter`: Codex in muxtower's own app-server)."""

import os
import shutil
from typing import Protocol

from muxtower.errors import Conflict, Invalid
from muxtower.runtimes.models import RuntimeInfo
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.models import CreateSession, Session
from muxtower.sessions.ports import HeadlessStarter


class NodeStarter(Protocol):
    def create(self, name: str, request: CreateSession) -> Session: ...


class Launcher:
    def __init__(
        self, directory: SessionDirectory, starters: list[HeadlessStarter], nodes: NodeStarter | None = None
    ) -> None:
        self.directory = directory
        self.starters = {s.runtime: s for s in starters}
        self.nodes = nodes  # a node of this daemon starts it, when asked to (`CreateSession.node`)

    def headless_runtimes(self) -> set[str]:
        return set(self.starters)

    def runtimes(self) -> list[RuntimeInfo]:
        return [
            RuntimeInfo(
                name=rt.name,
                binary=rt.config.binary,
                available=shutil.which(rt.config.binary) is not None,
                has_hooks=rt.config.hooks is not None,
                headless=rt.name in self.starters,
            )  # fmt: skip
            for rt in self.directory.local.runtimes.values()
        ]

    def create(self, request: CreateSession) -> Session:
        if request.node is not None:
            if self.nodes is None:
                raise Conflict("no node has joined this daemon")
            return self.directory.get(self.nodes.create(request.node, request).id)
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
