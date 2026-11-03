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
from muxtower.concierge.ports import ConciergeEvents, ConciergeStore, RecordedEvent
from muxtower.concierge.prompt import INSTRUCTIONS, UPDATE_PREFIX
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
SEND_AT_MOST = 20  # events in one message; the concierge asks list_events for older ones
HOLD_SECONDS = 120.0  # how long updates wait for a busy concierge before Claude Code queues them instead


def _fingerprint(session: Session) -> list[str]:
    reply = hashlib.sha256((session.last_message or "").encode()).hexdigest()[:16]
    return [session.state.value, reply]


class ConciergeService:
    def __init__(
        self,
        settings: ConciergeSettings,
        sessions: SessionService,
        directory: SessionDirectory,
        tokens: TokenService,
        store: ConciergeStore,
        events: ConciergeEvents,
        mcp_url: str,
    ) -> None:
        self.settings = settings
        self.sessions = sessions
        self.directory = directory
        self.tokens = tokens
        self.store = store
        self.events = events
        self.mcp_url = mcp_url
        self.state = store.load()
        self._held_since: float | None = None  # since when updates wait for a busy concierge

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
        self.state.seen[session.id] = _fingerprint(session)
        if (latest := self._latest(session)) is not None:
            self.state.cursors[session.id] = latest
        self.store.save(self.state)
        return session

    def unwatch(self, session_id: str) -> None:
        if session_id in self.state.watched:
            self.state.watched.remove(session_id)
        self.state.names.pop(session_id, None)
        self.state.seen.pop(session_id, None)
        self.state.cursors.pop(session_id, None)
        self.store.save(self.state)

    def _latest(self, session: Session) -> int | None:
        """Blocking. The number of its latest conversation item; None when it has no conversation."""
        if not session.capabilities.conversation:
            return None
        try:
            return self.directory.conversation(session.id, 0, 1).latest_seq
        except (Conflict, NotFound):
            return None

    def _event(self, session_id: str, name: str, kind: str, session: Session | None = None) -> Event:
        watched_as = self.state.names.get(session_id)
        event = Event(
            number=self.events.next_number(), at=datetime.now().astimezone(), session_id=session_id, name=name,
            watched_as=watched_as if watched_as and watched_as != name else None, kind=kind,
        )  # fmt: skip
        if session is not None:
            event.state = session.state.value
            event.after = self.state.cursors.get(session_id)
            event.latest = self._latest(session)
            if event.latest is not None:
                self.state.cursors[session_id] = event.latest
        return event

    def _record(self, event: Event) -> str:
        line = render(event)
        self.events.add(event.number, event.at, event.session_id, line)
        return line

    def updates(self) -> list[str]:
        """Blocking. Records an event for each watched session that finished a turn, started needing the
        owner, or ended, and returns their lines."""
        lines: list[str] = []
        changed = False
        for session_id in list(self.state.watched):
            session = self.directory.find(session_id)
            if session is None:
                name = self.state.names.get(session_id, session_id)
                lines.append(self._record(self._event(session_id, name, "ended")))
                self.unwatch(session_id)
                continue
            before = self.state.seen.get(session_id)
            now = _fingerprint(session)
            if before == now:
                continue
            self.state.seen[session_id] = now
            changed = True
            if before is None:
                if session_id not in self.state.cursors and (latest := self._latest(session)) is not None:
                    self.state.cursors[session_id] = latest  # told from here on
                continue
            if session.needs_attention and before[0] != session.state.value:
                event = self._event(session_id, session.name, "needs_owner", session)
                if pending := session.pending:
                    event.asks = f"{pending.tool_name or ''} {pending.detail or ''}".strip() or None
                    event.options = [(o.key, o.label) for o in pending.options]
                lines.append(self._record(event))
            elif session.state != AgentState.BUSY and before[1] != now[1]:
                event = self._event(session_id, session.name, "finished", session)
                event.said = session.reply_summary or session.last_message or None
                lines.append(self._record(event))
        if changed:
            self.store.save(self.state)  # what happens while the daemon is down is told after it
        return lines

    def recorded(self, after: int, limit: int = 50) -> list[RecordedEvent]:
        return self.events.after(after, limit)

    def deliver(self) -> None:
        """Blocking. Sends the events not yet told as one message, once the concierge is idle: not in the
        middle of its turn (or, after HOLD_SECONDS, queued by Claude Code) and never while it shows a prompt.
        Until then they wait on disk, also across restarts."""
        waiting = self.events.undelivered()
        if not waiting:
            self._held_since = None
            return
        if self._held_since is None:
            self._held_since = time.monotonic()
        concierge = self.directory.find(self.state.session_id) if self.state.session_id else None
        if concierge is None or concierge.needs_attention:
            return
        if concierge.state == AgentState.BUSY and time.monotonic() - self._held_since < HOLD_SECONDS:
            return
        # Remote Control takes the message whole; typed into a terminal, a newline would send it early.
        lines = [e.line for e in waiting[-SEND_AT_MOST:]]
        if (skipped := len(waiting) - SEND_AT_MOST) > 0:
            since, until = waiting[0].number - 1, waiting[skipped - 1].number
            lines.insert(0, f"{UPDATE_PREFIX}s] {skipped} earlier: list_events(after={since}) up to #{until}")
        text = ("\n" if concierge.remote_id else " | ").join(lines)
        try:
            self.directory.send_input(concierge.id, SendInput(text=text, enter=True))
        except Conflict as exc:
            logger.warning("could not tell the concierge: %s", exc)
            return
        self.events.mark_delivered(waiting[-1].number)
        self._held_since = None

    def _tell(self) -> None:
        self.updates()
        self.deliver()

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
                try:  # events held for a busy concierge, or left from before a restart
                    await asyncio.to_thread(self.deliver)
                except Exception:
                    logger.exception("concierge update failed")
                continue
            await asyncio.sleep(SETTLE_SECONDS)
            while not queue.empty():
                queue.get_nowait()
            try:
                await asyncio.to_thread(self._tell)
            except Exception:
                logger.exception("concierge update failed")
