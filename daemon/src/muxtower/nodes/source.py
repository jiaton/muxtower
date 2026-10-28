"""The sessions of this daemon's nodes, as a session source like any other (`SessionSourcePort`), plus
what only a daemon can do to them (screens, input, resizing, stopping, starting one).

Ids: a Remote Control session has one id wherever it is listed (the account's), so it keeps it, and the
same session reported by this daemon's own Remote Control source and by a node is one session. It is
the node's when its agent runs there (the node has its process, its terminal, its transcript), else it
stays with the source here. Every other session is "<node>~<its id>" (`~` is in no node name).

Every call is blocking, from a request thread: it is handed to the link on the event loop and waited
for. A node that is offline answers nothing; its sessions are listed from its last report, read only."""

import asyncio
from collections.abc import Callable
from typing import Any

from muxtower.approval.models import ApprovalResult
from muxtower.errors import Conflict, NotFound
from muxtower.nodes.hub import Node, Nodes
from muxtower.runtimes.models import AgentState
from muxtower.sessions.models import Capabilities, Conversation, CreateSession, Session, UpdateSession
from muxtower.sessions.ports import SessionSource
from muxtower.terminal.models import Resize, Screen, SendInput

SEPARATOR = "~"
CALL_SECONDS = 20.0
CREATE_SECONDS = 45.0
OFFLINE = Capabilities(screen=False, conversation=False, keys=[], resize=False, terminate=False, rename=False)


def hub_id(node: str, session: Session) -> str:
    return session.id if session.source == SessionSource.REMOTE_CONTROL else f"{node}{SEPARATOR}{session.id}"


class NodeSource:
    def __init__(self, nodes: Nodes) -> None:
        self.nodes = nodes
        nodes.listed_as = self.listed_as
        # Whether another source here lists a session too (set by the directory), so a Remote Control
        # session that runs nowhere near a node stays with the source here.
        self.elsewhere: Callable[[str], bool] = lambda _: False

    # --- which node ---------------------------------------------------------------------------

    def _copies(self, session_id: str) -> list[tuple[Node, Session]]:
        nodes = list(self.nodes.all().items())
        if SEPARATOR in session_id:
            name, local = session_id.split(SEPARATOR, 1)
            node = dict(nodes).get(name)
            found = node.sessions.get(local) if node else None
            return [(node, found)] if node and found and found.source != SessionSource.REMOTE_CONTROL else []
        return [
            (node, s) for _, node in nodes
            if (s := node.sessions.get(session_id)) and s.source == SessionSource.REMOTE_CONTROL
        ]  # fmt: skip

    def _resolve(self, session_id: str) -> tuple[Node, Session] | None:
        copies = self._copies(session_id)
        if not copies:
            return None
        hosted = [c for c in copies if c[1].on_host]
        if hosted:
            return max(hosted, key=lambda c: c[0].online)
        if SEPARATOR in session_id or not self.elsewhere(session_id):
            return max(copies, key=lambda c: c[0].online)
        return None

    def _require(self, session_id: str) -> tuple[Node, Session]:
        found = self._resolve(session_id)
        if found is None:
            raise NotFound(f"unknown session {session_id}")
        return found

    def view(self, node: Node, session: Session) -> Session:
        update: dict[str, object] = {"id": hub_id(node.record.name, session), "node": node.record.name}
        if not node.online:
            update.update(offline=True, capabilities=OFFLINE, needs_attention=False, can_auto_approve=False)
        return session.model_copy(update=update)

    def listed_as(self, name: str, session: Session) -> str | None:
        found = self._resolve(hub_id(name, session))
        listed = found is not None and found[0].record.name == name and found[1].id == session.id
        return hub_id(name, session) if listed else None

    def owns(self, session_id: str) -> bool:
        return self._resolve(session_id) is not None

    def views(self) -> list[Session]:
        nodes = list(self.nodes.all().values())
        out = []
        for node in nodes:
            for session in list(node.sessions.values()):
                found = self._resolve(hub_id(node.record.name, session))
                if session.node is None and found is not None and found[0] is node and found[1] is session:
                    out.append(self.view(node, session))
        return out

    def get(self, session_id: str) -> Session:
        return self.view(*self._require(session_id))

    def node_of(self, session_id: str) -> str | None:
        found = self._resolve(session_id)
        return found[0].record.name if found else None

    # --- calls --------------------------------------------------------------------------------

    def _call(
        self, session_id: str, method: str, params: dict[str, Any] | None = None, timeout: float = CALL_SECONDS
    ) -> Any:
        node, session = self._require(session_id)
        return self.call(node.record.name, method, {"session_id": session.id, **(params or {})}, timeout)

    def call(self, name: str, method: str, params: dict[str, Any], timeout: float = CALL_SECONDS) -> Any:
        link = self.nodes.link_of(name)
        loop = self.nodes.loop
        if loop is None:
            raise Conflict(f"{name} is offline")
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is loop:
            raise RuntimeError("a node call would block the event loop")
        return asyncio.run_coroutine_threadsafe(link.call(method, params, timeout), loop).result(timeout + 5)

    def conversation(self, session_id: str, after: int, limit: int) -> Conversation:
        result = self._call(session_id, "conversation", {"after": after, "limit": limit})
        return Conversation.model_validate(result).model_copy(update={"session_id": session_id})

    def screen(self, session_id: str, history: int) -> Screen:
        result = self._call(session_id, "screen", {"history": history})
        return Screen.model_validate(result).model_copy(update={"session_id": session_id})

    def approve(
        self, session_id: str, option: str | None, answers: list[list[str]] | None = None
    ) -> tuple[AgentState, str]:
        params = {"option": option} if answers is None else {"option": option, "answers": answers}
        result = ApprovalResult.model_validate(self._call(session_id, "approve", params))
        return result.state, result.option or ""

    def deny(self, session_id: str) -> AgentState:
        return ApprovalResult.model_validate(self._call(session_id, "deny")).state

    def send_input(self, session_id: str, body: SendInput) -> None:
        self._call(session_id, "input", {"body": body.model_dump(mode="json")})

    def send_text(self, session_id: str, text: str) -> None:
        self.send_input(session_id, SendInput(text=text, enter=True))

    def send_key(self, session_id: str, key: str) -> None:
        self.send_input(session_id, SendInput(key=key))

    def resize(self, session_id: str, body: Resize) -> None:
        self._call(session_id, "resize", {"body": body.model_dump(mode="json")})

    def release_size(self, session_id: str) -> None:
        self._call(session_id, "release_size")

    def update(self, session_id: str, patch: UpdateSession) -> Session:
        node, _ = self._require(session_id)
        result = Session.model_validate(self._call(session_id, "update", {"patch": patch.model_dump(mode="json")}))
        return self.view(node, result)

    def terminate(self, session_id: str) -> None:
        self._call(session_id, "terminate")

    def archive(self, session_id: str) -> None:
        self._call(session_id, "archive", timeout=CREATE_SECONDS)

    def mark_read(self, session_id: str) -> None:
        """Best effort: read here already (the marks), and on its node when it is connected."""
        node, _ = self._require(session_id)
        if node.online:
            self._call(session_id, "mark_read")

    def detect_folder(self, session_id: str) -> str | None:
        folder = self._call(session_id, "detect_folder", timeout=CREATE_SECONDS)
        return folder if isinstance(folder, str) else None

    def create(self, name: str, request: CreateSession) -> Session:
        body = request.model_copy(update={"node": None}).model_dump(mode="json")
        result = Session.model_validate(self.call(name, "create", {"request": body}, CREATE_SECONDS))
        node = self.nodes.node(name)
        self.nodes.remember(node, result)
        return self.view(node, result)

    # --- screens (from the stream, on the event loop: never waits) ----------------------------

    def watch_screen(self, session_id: str, history: int, watching: bool) -> None:
        found = self._resolve(session_id)
        if found is None:
            return
        node, session = found
        self.nodes.watch(node, session.id, history, watching)
        link, loop = node.link, self.nodes.loop
        if link is not None and loop is not None:
            method = "watch_screen" if watching else "unwatch_screen"
            params = {"session_id": session.id, "history": history}
            asyncio.run_coroutine_threadsafe(link.notify(method, params), loop)
