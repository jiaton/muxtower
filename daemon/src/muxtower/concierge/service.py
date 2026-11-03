"""The concierge: one Claude Code session muxtower keeps running for the owner to talk to. It reaches the
other sessions through muxtower's MCP tools; muxtower tells it when sessions it watches finish a turn or
start needing the owner, with a "[muxtower event #N · time] …" line per event (`events.py`), sent only
while it is idle so the line does not land in the middle of its turn or answer its own prompt."""

import asyncio
import hashlib
import json
import logging
import time
from datetime import datetime
from typing import Any

from muxtower.auth.service import TokenService
from muxtower.concierge.events import Event, render
from muxtower.concierge.ports import ConciergeStore
from muxtower.concierge.prompt import INSTRUCTIONS
from muxtower.config import ConciergeSettings
from muxtower.errors import Conflict, Invalid, NotFound
from muxtower.infra.bus import EventBus
from muxtower.runtimes.models import AgentState
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.models import CreateSession, Session
from muxtower.sessions.service import SessionService
from muxtower.terminal.models import SendInput

logger = logging.getLogger("muxtower.concierge")

TOKEN_NAME = "concierge"  # noqa: S105 - a device name, not a secret
MCP_SERVER = "muxtower"
ENSURE_SECONDS = 30
SETTLE_SECONDS = 2.0  # let a burst of changes settle before telling the concierge
HOLD_SECONDS = 120.0  # how long updates wait for a busy concierge before Claude Code queues them instead


def _fingerprint(session: Session) -> tuple[AgentState, str]:
    reply = hashlib.sha256((session.last_message or "").encode()).hexdigest()[:16]
    return session.state, reply


class ConciergeService:
    def __init__(
        self,
        settings: ConciergeSettings,
        sessions: SessionService,
        directory: SessionDirectory,
        tokens: TokenService,
        store: ConciergeStore,
        mcp_url: str,
    ) -> None:
        self.settings = settings
        self.sessions = sessions
        self.directory = directory
        self.tokens = tokens
        self.store = store
        self.mcp_url = mcp_url
        self.state = store.load()
        self._seen: dict[str, tuple[AgentState, str]] = {}
        self._cursor: dict[str, int] = {}  # the last conversation item each watched session was told up to
        self._outbox: list[str] = []  # updates held while the concierge is busy or waits on the owner
        self._held_since: float | None = None

    @property
    def session_id(self) -> str | None:
        return self.state.session_id

    # --- the session --------------------------------------------------------------------------

    def ensure(self) -> bool:
        """Blocking. Starts the concierge session if it is not running; True when it did."""
        if self.state.session_id and self.sessions.repo.get(self.state.session_id):
            self.directory.concierge_id = self.state.session_id
            return False
        # A fresh token per start: the old one dies with the old session.
        self.tokens.revoke(TOKEN_NAME)
        _, token = self.tokens.create(TOKEN_NAME)
        server = {"type": "http", "url": self.mcp_url, "headers": {"Authorization": f"Bearer {token}"}}
        mcp_config = self.store.write_private("mcp.json", json.dumps({"mcpServers": {MCP_SERVER: server}}))
        prompt = self.store.write_private("instructions.md", INSTRUCTIONS)
        cfg = self.settings
        args = [
            "--model", cfg.model, "--append-system-prompt-file", str(prompt), "--mcp-config", str(mcp_config),
            "--allowedTools", f"mcp__{MCP_SERVER}", *cfg.args,
            *(["--remote-control", cfg.name] if cfg.remote_control else []),
        ]  # fmt: skip
        cwd = cfg.cwd.expanduser()
        cwd.mkdir(parents=True, exist_ok=True)
        session = self.sessions.create(CreateSession(runtime="claude-code", cwd=str(cwd), name=cfg.name, args=args))
        logger.info("concierge started as session %s", session.id)
        self.state.session_id = session.id
        self.store.save(self.state)
        self.directory.concierge_id = session.id
        return True

    # --- watching -----------------------------------------------------------------------------

    def watch(self, session_id: str) -> Session:
        if session_id == self.state.session_id:
            raise Invalid("the concierge does not watch itself")
        session = self.directory.get(session_id)
        if session.id not in self.state.watched:
            self.state.watched.append(session.id)
        self.state.names[session.id] = session.name
        self.store.save(self.state)
        self._seen[session.id] = _fingerprint(session)
        if (latest := self._latest(session)) is not None:
            self._cursor[session.id] = latest
        return session

    def unwatch(self, session_id: str) -> None:
        if session_id in self.state.watched:
            self.state.watched.remove(session_id)
        self.state.names.pop(session_id, None)
        self.store.save(self.state)
        self._seen.pop(session_id, None)
        self._cursor.pop(session_id, None)

    def _latest(self, session: Session) -> int | None:
        """Blocking. The number of its latest conversation item; None when it has no conversation."""
        if not session.capabilities.conversation:
            return None
        try:
            return self.directory.conversation(session.id, 0, 1).latest_seq
        except (Conflict, NotFound):
            return None

    def _event(self, session_id: str, name: str, kind: str, session: Session | None = None) -> Event:
        self.state.events += 1
        watched_as = self.state.names.get(session_id)
        event = Event(
            number=self.state.events, at=datetime.now().astimezone(), session_id=session_id, name=name,
            watched_as=watched_as if watched_as and watched_as != name else None, kind=kind,
        )  # fmt: skip
        if session is not None:
            event.state = session.state.value
            event.after = self._cursor.get(session_id)
            event.latest = self._latest(session)
            if event.latest is not None:
                self._cursor[session_id] = event.latest
        return event

    def updates(self) -> list[str]:
        """Blocking. One line per watched session that finished a turn, started needing the owner, or ended."""
        lines: list[str] = []
        for session_id in list(self.state.watched):
            session = self.directory.find(session_id)
            if session is None:
                lines.append(render(self._event(session_id, self.state.names.get(session_id, session_id), "ended")))
                self.unwatch(session_id)
                continue
            before = self._seen.get(session_id)
            now = self._seen[session_id] = _fingerprint(session)
            if before is None or before == now:
                if before is None and session_id not in self._cursor and (latest := self._latest(session)):
                    self._cursor[session_id] = latest  # watched before a restart: told from here on
                continue
            if session.needs_attention and before[0] != session.state:
                event = self._event(session_id, session.name, "needs_owner", session)
                if pending := session.pending:
                    event.asks = f"{pending.tool_name or ''} {pending.detail or ''}".strip() or None
                    event.options = [(o.key, o.label) for o in pending.options]
                lines.append(render(event))
            elif session.state != AgentState.BUSY and before[1] != now[1]:
                event = self._event(session_id, session.name, "finished", session)
                event.said = session.reply_summary or session.last_message or None
                lines.append(render(event))
        if lines:
            self.store.save(self.state)  # the event numbers go on after a restart
        return lines

    def deliver(self, lines: list[str]) -> None:
        """Blocking. Sends what is waiting as one message, once the concierge is idle: not in the middle of
        its turn (or, after HOLD_SECONDS, queued by Claude Code) and never while it shows a prompt."""
        self._outbox += lines
        if not self._outbox:
            return
        if self._held_since is None:
            self._held_since = time.monotonic()
        concierge = self.directory.find(self.state.session_id) if self.state.session_id else None
        if concierge is None or concierge.needs_attention:
            return
        if concierge.state == AgentState.BUSY and time.monotonic() - self._held_since < HOLD_SECONDS:
            return
        # Remote Control takes the message whole; typed into a terminal, a newline would send it early.
        text = ("\n" if concierge.remote_id else " | ").join(self._outbox)
        try:
            self.directory.send_input(concierge.id, SendInput(text=text, enter=True))
        except Conflict as exc:
            logger.warning("could not tell the concierge: %s", exc)
            return
        self._outbox, self._held_since = [], None

    async def run_loop(self, bus: EventBus) -> None:
        queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        bus.subscribe("sessions", queue)
        bus.subscribe("attention:*", queue)
        while True:
            try:
                if await asyncio.to_thread(self.ensure):
                    bus.publish("sessions", None)
            except Exception:
                logger.exception("could not start the concierge")
            try:
                await asyncio.wait_for(queue.get(), timeout=ENSURE_SECONDS)
            except TimeoutError:
                if self._outbox:  # held for a busy concierge: try again
                    try:
                        await asyncio.to_thread(self.deliver, [])
                    except Exception:
                        logger.exception("concierge update failed")
                continue
            await asyncio.sleep(SETTLE_SECONDS)
            while not queue.empty():
                queue.get_nowait()
            try:
                await asyncio.to_thread(lambda: self.deliver(self.updates()))
            except Exception:
                logger.exception("concierge update failed")
