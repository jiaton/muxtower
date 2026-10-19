"""The concierge: one Claude Code session muxtower keeps running for the owner to talk to. It reaches the
other sessions through muxtower's MCP tools; muxtower tells it when sessions it watches finish a turn or
start needing the owner, by typing a one-line "[muxtower] …" message into it."""

import asyncio
import hashlib
import json
import logging
from typing import Any

from muxtower.auth.service import TokenService
from muxtower.concierge.ports import ConciergeStore
from muxtower.concierge.prompt import INSTRUCTIONS, UPDATE_PREFIX
from muxtower.config import ConciergeSettings
from muxtower.errors import Conflict, Invalid
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
UPDATE_CHARS = 600


def _fingerprint(session: Session) -> tuple[AgentState, str]:
    reply = hashlib.sha256((session.last_message or "").encode()).hexdigest()[:16]
    return session.state, reply


def _one_line(text: str, limit: int = UPDATE_CHARS) -> str:
    flat = " ".join(text.split())
    return flat if len(flat) <= limit else flat[: limit - 1] + "…"


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
        self._outbox: list[str] = []  # updates held while the concierge itself waits on the owner

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
            self.store.save(self.state)
        self._seen[session.id] = _fingerprint(session)
        return session

    def unwatch(self, session_id: str) -> None:
        if session_id in self.state.watched:
            self.state.watched.remove(session_id)
            self.store.save(self.state)
        self._seen.pop(session_id, None)

    def updates(self) -> list[str]:
        """Blocking. One line per watched session that finished a turn, started needing the owner, or ended."""
        lines: list[str] = []
        for session_id in list(self.state.watched):
            session = self.directory.find(session_id)
            if session is None:
                lines.append(f"{UPDATE_PREFIX} session {session_id} ended (no longer watched).")
                self.unwatch(session_id)
                continue
            before = self._seen.get(session_id)
            now = self._seen[session_id] = _fingerprint(session)
            if before is None or before == now:
                continue
            label = f"{UPDATE_PREFIX} {session.name} ({session.id})"
            if session.needs_attention and before[0] != session.state:
                pending = session.pending
                asks = _one_line(f"{pending.tool_name or ''} {pending.detail or ''}".strip()) if pending else ""
                options = ", ".join(f"{o.key}={o.label}" for o in pending.options) if pending else ""
                lines.append(f"{label} needs the owner: {asks or session.state.value}. Options: {options or '-'}")
            elif session.state != AgentState.BUSY and before[1] != now[1]:
                said = session.reply_summary or session.last_message or ""
                lines.append(f"{label} finished a turn: {_one_line(said)}")
        return lines

    def deliver(self, lines: list[str]) -> None:
        """Blocking. Sends the updates as one message; held back while the concierge shows a prompt."""
        self._outbox += lines
        concierge = self.directory.find(self.state.session_id) if self.state.session_id else None
        if not self._outbox or concierge is None or concierge.needs_attention:
            return
        text, self._outbox = " | ".join(self._outbox), []
        try:
            self.directory.send_input(concierge.id, SendInput(text=text, enter=True))
        except Conflict as exc:
            logger.warning("could not tell the concierge: %s", exc)

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
                continue
            await asyncio.sleep(SETTLE_SECONDS)
            while not queue.empty():
                queue.get_nowait()
            try:
                await asyncio.to_thread(lambda: self.deliver(self.updates()))
            except Exception:
                logger.exception("concierge update failed")
