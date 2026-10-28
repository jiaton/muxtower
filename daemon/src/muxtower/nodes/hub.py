"""The nodes joined to this daemon (it is their hub): who they are, whether they are connected, and what
they last reported.

A node joins with a pairing code (`claim`) and gets a token of its own, which opens its link and nothing
else: a node is not a device and cannot use the API. While linked it reports its sessions whole on every
change; the last report is kept in SQLite, so after a restart here, or while the node sleeps, its
sessions are still listed, offline. Events from links arrive on the event loop; reads come from request
threads too, so the state is guarded by a lock that is never held across I/O."""

import asyncio
import hashlib
import logging
import re
import secrets
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from pydantic import ValidationError

from muxtower import __version__
from muxtower.errors import Conflict, NotFound
from muxtower.infra.bus import EventBus
from muxtower.nodes.link import NodeLink
from muxtower.nodes.models import NodeInfo
from muxtower.nodes.protocol import CLOSE_REVOKED, Hello
from muxtower.nodes.repository import NodeRecord, NodeRepository
from muxtower.nodes.update import newer
from muxtower.runtimes.models import RuntimeInfo
from muxtower.sessions.models import ConversationItem, Session

logger = logging.getLogger("muxtower.nodes")


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def slug(name: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40].strip("-")
    return cleaned or "node"


@dataclass(eq=False)
class Node:
    record: NodeRecord
    sessions: dict[str, Session] = field(default_factory=dict)  # by the node's own ids
    link: NodeLink | None = None
    screens: dict[str, list[int]] = field(default_factory=dict)  # watched here: local id -> histories

    @property
    def online(self) -> bool:
        return self.link is not None and not self.link.closed


def _parse(raw: list[dict[str, Any]], name: str) -> dict[str, Session]:
    sessions: dict[str, Session] = {}
    for item in raw:
        try:
            session = Session.model_validate(item)
        except ValidationError as exc:  # a newer node may send what this daemon cannot read yet
            logger.warning("skipping a session from %s: %s", name, exc.errors()[0]["msg"])
            continue
        sessions[session.id] = session
    return sessions


class Nodes:
    def __init__(self, repo: NodeRepository, bus: EventBus) -> None:
        self.repo = repo
        self.bus = bus
        self._lock = threading.Lock()
        self.nodes = {r.name: Node(r, _parse(r.sessions, r.name)) for r in repo.list()}
        self.loop: asyncio.AbstractEventLoop | None = None  # the loop links run on, once one connects
        # The id a node's session is listed under here, or None when another copy of it is the one listed
        # (`NodeSource.listed_as`): its events go out under the id clients know, or not at all.
        self.listed_as: Callable[[str, Session], str | None] = lambda node, s: f"{node}~{s.id}"

    # --- membership ---------------------------------------------------------------------------

    def claim(self, wanted: str) -> tuple[str, str]:
        """A new node named after `wanted` (made unique): (its name, its token, shown once)."""
        token = "mxn_" + secrets.token_urlsafe(32)
        with self._lock:
            base, n = slug(wanted), 2
            name = base
            while name in self.nodes:
                name, n = f"{base}-{n}", n + 1
            record = NodeRecord(name=name, token_hash=token_hash(token), joined_at=datetime.now(UTC))
            self.repo.add(record)
            self.nodes[name] = Node(record)
        return name, token

    def authenticate(self, token: str) -> str | None:
        if not token:
            return None
        presented = token_hash(token)
        with self._lock:
            return next(
                (n for n, node in self.nodes.items() if secrets.compare_digest(node.record.token_hash, presented)), None
            )

    def revoke(self, name: str) -> None:
        with self._lock:
            node = self.nodes.pop(name, None)
        if node is None:
            raise NotFound(f"no node named {name}")
        self.repo.delete(name)
        if node.link is not None and self.loop is not None:
            self.loop.call_soon_threadsafe(node.link.close, CLOSE_REVOKED)
        self.bus.publish("sessions", None)

    def infos(self) -> list[NodeInfo]:
        with self._lock:
            return [
                NodeInfo(
                    name=name,
                    online=node.online,
                    version=node.record.version,
                    update=__version__ if newer(__version__, node.record.version) else None,
                    joined_at=node.record.joined_at,
                    last_seen=None if node.online else node.record.last_seen,
                    sessions=len(node.sessions),
                    runtimes=[RuntimeInfo.model_validate(r) for r in node.record.runtimes],
                )  # fmt: skip
                for name, node in sorted(self.nodes.items())
            ]

    def all(self) -> dict[str, Node]:
        with self._lock:
            return dict(self.nodes)

    def remember(self, node: Node, session: Session) -> None:
        """A session the node just started, listed before its node's next report comes."""
        with self._lock:
            node.sessions = {**node.sessions, session.id: session}

    def watch(self, node: Node, session_id: str, history: int, watching: bool) -> None:
        """Which of the node's screens are watched here (to watch again after a reconnect)."""
        with self._lock:
            histories = node.screens.setdefault(session_id, [])
            if watching:
                histories.append(history)
            elif history in histories:
                histories.remove(history)
            if not histories:
                node.screens.pop(session_id, None)

    def node(self, name: str) -> Node:
        with self._lock:
            found = self.nodes.get(name)
        if found is None:
            raise NotFound(f"no node named {name}")
        return found

    def link_of(self, name: str) -> NodeLink:
        node = self.node(name)
        if not node.online or node.link is None:
            raise Conflict(f"{name} is offline")
        return node.link

    # --- links (event loop) -------------------------------------------------------------------

    async def attach(self, name: str, link: NodeLink, hello: Hello) -> None:
        """A node connected (a newer link replaces an older one): watched screens are watched again."""
        self.loop = asyncio.get_running_loop()
        with self._lock:
            node = self.nodes.get(name)
            if node is None:
                return
            old, node.link = node.link, link
            node.record.version = hello.version
            node.record.runtimes = [r.model_dump(mode="json") for r in hello.runtimes]
            node.record.platform = hello.platform or node.record.platform
            node.record.last_seen = datetime.now(UTC)
            watched = {sid: list(h) for sid, h in node.screens.items()}
        if old is not None:
            old.close()
        self.repo.save(node.record)
        for session_id, histories in watched.items():
            for history in histories:
                await link.notify("watch_screen", {"session_id": session_id, "history": history})
        logger.info("node %s connected (%s)", name, hello.version)
        self.bus.publish("sessions", None)

    def detach(self, name: str, link: NodeLink) -> None:
        link.close()
        with self._lock:
            node = self.nodes.get(name)
            if node is None or node.link is not link:
                return
            node.link = None
            node.record.last_seen = datetime.now(UTC)
        self.repo.save(node.record)
        logger.info("node %s disconnected", name)
        self.bus.publish("sessions", None)

    def on_event(self, name: str, kind: str, data: Any) -> None:
        if kind == "sessions" and isinstance(data, list):
            self._sessions(name, data)
        elif kind in ("conversation", "screen") and isinstance(data, dict):
            self._forward(name, data, kind)
        elif kind == "running" and isinstance(data, list):
            self._running(name, data)

    def _running(self, name: str, raw: list[dict[str, Any]]) -> None:
        with self._lock:
            node = self.nodes.get(name)
            if node is None or node.record.running == raw:
                return
            node.record.running = raw
        self.repo.save(node.record)
        self.bus.publish("sessions", None)

    def _sessions(self, name: str, raw: list[dict[str, Any]]) -> None:
        fresh = _parse(raw, name)
        with self._lock:
            node = self.nodes.get(name)
            if node is None:
                return
            before, node.sessions = node.sessions, fresh
            node.record.sessions = raw
            node.record.last_seen = datetime.now(UTC)
        self.repo.save(node.record)
        for session in fresh.values():
            prior = before.get(session.id)
            # Not on first sight (like every source): no alerts for prompts that were there before.
            listed = self.listed_as(name, session)
            if listed and session.needs_attention and prior is not None and prior.state != session.state:
                self.bus.publish(f"attention:{listed}", None)
        self.bus.publish("sessions", None)

    def _forward(self, name: str, data: dict[str, Any], kind: str) -> None:
        with self._lock:
            node = self.nodes.get(name)
            session = node.sessions.get(str(data.get("session_id"))) if node else None
        listed = self.listed_as(name, session) if session else None
        if listed is None:
            return
        topic = f"{kind}:{listed}"
        if kind == "screen":
            self.bus.publish(topic, str(data.get("ansi", "")))
            return
        try:
            items = [ConversationItem.model_validate(i) for i in data.get("items") or []]
        except ValidationError:
            return
        self.bus.publish(topic, items)
