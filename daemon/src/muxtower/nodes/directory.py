"""The session directory of a daemon with nodes: a node's sessions are one more source, and what a
source cannot do (a screen, input as typed, resizing, renaming, stopping) goes to the node as well.

Every daemon is built with it; one that no node has joined behaves exactly as `SessionDirectory`."""

from typing import Any

from muxtower.errors import Conflict
from muxtower.nodes.processes import NodeProcesses
from muxtower.nodes.source import NodeSource
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.images import ImageFile
from muxtower.sessions.models import Conversation, Session, UpdateSession
from muxtower.terminal.models import Resize, Screen, SendInput


class HubDirectory(SessionDirectory):
    def __init__(self, *args: Any, nodes: NodeSource, node_processes: NodeProcesses, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.nodes = nodes
        self.node_processes = node_processes
        self.sources = [nodes, *self.sources]  # asked first: it yields what it does not run (`owns`)
        nodes.elsewhere = lambda session_id: any(s is not nodes and s.owns(session_id) for s in self.sources)

    def _decorate(self, session: Session) -> Session:
        """Also: a session no daemon runs, in a folder of the one node of its kind, is taken for that
        node's; a machine the owner named as a node is spelled as the node is."""
        session = super()._decorate(session)
        machine = session.machine
        if machine is None and session.node is None and not session.on_host:
            machine = self.node_processes.machine_for(session.cwd)
        if machine:
            machine = self.node_processes.named(machine) or machine
        return session.model_copy(update={"machine": machine}) if machine != session.machine else session

    def _on_node(self, session_id: str) -> bool:
        """Its node has it, and it is not one kept in the archive here."""
        archived = self.archive_store is not None and self.archive_store.get(session_id) is not None
        return not archived and self.source_of(session_id) is self.nodes

    def conversation(self, session_id: str, after: int, limit: int) -> Conversation:
        if self._on_node(session_id):  # its node reads it from where it is whole (its transcript)
            self.require(session_id, "conversation")
            return self.nodes.conversation(session_id, after, limit)
        return super().conversation(session_id, after, limit)

    def image(self, session_id: str, path: str) -> ImageFile:
        if self._on_node(session_id):  # read where it runs
            self.require(session_id, "conversation")
            return self.nodes.image(session_id, path)
        return super().image(session_id, path)

    def screen(self, session_id: str, history: int) -> Screen:
        if self._on_node(session_id):
            self.require(session_id, "screen")
            return self.nodes.screen(session_id, history)
        return super().screen(session_id, history)

    def watch_screen(self, session_id: str, history: int, watching: bool) -> None:
        if self.nodes.owns(session_id):
            self.nodes.watch_screen(session_id, history, watching)
        else:
            super().watch_screen(session_id, history, watching)

    def send_input(self, session_id: str, body: SendInput) -> None:
        if not self._on_node(session_id):
            return super().send_input(session_id, body)
        session = self.get(session_id)
        keys = session.capabilities.keys
        if session.offline or session.archived_at:
            raise Conflict(f"{session.node} is offline" if session.offline else "this session is archived")
        if body.key is not None and keys and body.key not in keys:
            raise Conflict(f"this session takes only these keys: {', '.join(keys)}")
        self.nodes.send_input(session_id, body)  # whole: typed into its terminal or sent as a message there

    def resize(self, session_id: str, body: Resize) -> None:
        if self._on_node(session_id):
            self.require(session_id, "resize")
            self.nodes.resize(session_id, body)
        else:
            super().resize(session_id, body)

    def release_size(self, session_id: str) -> None:
        if not self._on_node(session_id):
            super().release_size(session_id)
        elif self.get(session_id).capabilities.resize:
            self.nodes.release_size(session_id)

    def update(self, session_id: str, patch: UpdateSession) -> Session:
        if self._on_node(session_id):
            return self._decorate(self.nodes.update(session_id, patch))
        return super().update(session_id, patch)

    def terminate(self, session_id: str) -> None:
        if self._on_node(session_id) and not (self.archive_store and self.archive_store.get(session_id)):
            self.require(session_id, "terminate")
            self.nodes.terminate(session_id)
        else:
            super().terminate(session_id)
