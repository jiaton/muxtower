"""FastAPI application factory: builds adapters and services, keeps them on app.state, starts loops."""

import asyncio
import logging
import secrets
import socket
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from muxtower import __version__
from muxtower.approval.auto import AutoApprover
from muxtower.approval.service import ApprovalService
from muxtower.asr.openai_compatible import OpenAICompatibleTranscriber
from muxtower.asr.routes import router as asr_router
from muxtower.asr.service import AsrService
from muxtower.auth.deps import DAEMON_AUTH_HEADER
from muxtower.auth.pairing import PairingService
from muxtower.auth.repository import SqliteTokenRepository
from muxtower.auth.routes import router as auth_router
from muxtower.auth.service import TokenService
from muxtower.auth.stream_cookie import StreamCookieSigner
from muxtower.concierge.service import ConciergeService
from muxtower.concierge.store import FileConciergeStore
from muxtower.config import Settings
from muxtower.errors import Conflict, Forbidden, Invalid, NotFound, TooManyRequests, Unauthorized, Unavailable
from muxtower.hooks.routes import router as hooks_router
from muxtower.infra.audit import AuditLog
from muxtower.infra.bus import EventBus
from muxtower.infra.db import Database
from muxtower.infra.tmux import TmuxCli, TmuxError
from muxtower.mcp.routes import router as mcp_router
from muxtower.mcp.service import McpTools
from muxtower.net import ClientAddress
from muxtower.notify.repository import SqliteSubscriptionRepository
from muxtower.notify.routes import router as push_router
from muxtower.notify.service import PushService
from muxtower.notify.webpush_sender import WebPushSender
from muxtower.origins import OriginPolicy
from muxtower.runtimes.spec import load_runtimes
from muxtower.sessions.claude_processes import ClaudeProcesses
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.marks import SessionMarks, SqliteMarksRepository
from muxtower.sessions.monitor import Monitor
from muxtower.sessions.repository import SqliteSessionRepository
from muxtower.sessions.routes import router as sessions_router
from muxtower.sessions.service import SessionConfig, SessionService
from muxtower.sessions.transcripts import Transcripts
from muxtower.sessions.turns import TurnWatcher
from muxtower.sources.remote_control.service import RemoteControlSource
from muxtower.summaries.cli import ClaudeCodeSummarizer, CodexSummarizer
from muxtower.summaries.ports import Summarizer
from muxtower.summaries.repository import SqliteSummaryRepository
from muxtower.summaries.routes import router as summaries_router
from muxtower.summaries.service import SummaryService
from muxtower.system.routes import router as system_router
from muxtower.terminal.ports import TmuxPort
from muxtower.terminal.service import TerminalService
from muxtower.terminal.stream import router as stream_router
from muxtower.web import mount_ui

logger = logging.getLogger("muxtower")

CLI_TOKEN_NAME = "local-cli"  # noqa: S105 - a device name, not a secret


def local_cli_token(settings: Settings) -> str:
    """Token the `muxtower` command uses to talk to a daemon on the same machine (file mode 0600)."""
    path = settings.state_dir / "cli-token"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(secrets.token_urlsafe(32))
        path.chmod(0o600)
    return path.read_text().strip()


def build_token_service(settings: Settings, db: Database | None = None) -> TokenService:
    db = db or Database(settings.db_path)
    db.migrate()
    extra = {CLI_TOKEN_NAME: local_cli_token(settings)}
    if settings.pairing.shared_token:
        extra["shared"] = settings.pairing.shared_token
    return TokenService(SqliteTokenRepository(db), extra)


def build_remote_control(settings: Settings) -> RemoteControlSource | None:
    rc = settings.remote_control
    if not rc.enabled:
        return None
    from muxtower.sources.remote_control.adapter import AnthropicRemoteControl  # only when enabled

    return RemoteControlSource(AnthropicRemoteControl(rc.credentials_path, rc.config_path), rc.environments)


def build_summaries(settings: Settings, db: Database) -> SummaryService:
    cfg = settings.summaries
    workdir = settings.state_dir / "summarizer"  # empty: no project instructions for the summarizer
    summarizer: Summarizer | None = None
    if cfg.provider == "claude-code":
        summarizer = ClaudeCodeSummarizer(workdir, cfg.binary or "claude", cfg.model or "haiku", cfg.timeout_seconds)
    elif cfg.provider == "codex":
        summarizer = CodexSummarizer(workdir, cfg.binary or "codex", cfg.model, cfg.timeout_seconds)
    return SummaryService(summarizer, SqliteSummaryRepository(db), cfg.min_chars)


def build_asr(settings: Settings, hints: Callable[[], list[str]]) -> AsrService:
    cfg = settings.asr
    key = cfg.key()
    if cfg.provider == "off":
        return AsrService(None, cfg.language)
    if not key:
        logger.warning("asr.provider is %s but no API key is set; voice is off", cfg.provider)
        return AsrService(None, cfg.language)
    return AsrService(OpenAICompatibleTranscriber(cfg.provider, key, cfg.model), cfg.language, hints, cfg.prompt)


def _log_crash(task: asyncio.Task[None]) -> None:
    if not task.cancelled() and task.exception() is not None:
        logger.error("background task %s crashed", task.get_name(), exc_info=task.exception())


def create_app(
    settings: Settings,
    tmux: TmuxPort | None = None,
    run_loops: bool = True,
    remote_control: RemoteControlSource | None = None,
) -> FastAPI:
    db = Database(settings.db_path)
    tokens = build_token_service(settings, db)
    daemon_name = settings.name or socket.gethostname()
    bus = EventBus()
    sessions = SessionService(
        SqliteSessionRepository(db),
        tmux or TmuxCli(),
        load_runtimes(settings.config_dir / "runtimes"),
        SessionConfig(settings.tmux_socket, settings.adopt_sockets, settings.local_url, settings.state_dir),
    )
    remote_control = remote_control or build_remote_control(settings)
    processes = ClaudeProcesses()  # links panes to Remote Control and to their transcripts
    monitor = Monitor(sessions, processes)
    approvals = ApprovalService(sessions)
    terminal = TerminalService(sessions, monitor)
    summaries = build_summaries(settings, db)
    marks = SessionMarks(SqliteMarksRepository(db))
    transcripts = Transcripts()
    directory = SessionDirectory(
        sessions, terminal, approvals, [remote_control] if remote_control else [], summaries, daemon_name, processes,
        marks, transcripts,
    )  # fmt: skip
    audit = AuditLog(db)
    concierge: ConciergeService | None = None
    if settings.concierge.enabled:
        store = FileConciergeStore(settings.state_dir / "concierge.json", settings.state_dir / "concierge")
        mcp_url = f"{settings.local_url}/v1/mcp"
        concierge = ConciergeService(settings.concierge, sessions, directory, tokens, store, mcp_url)
    push = PushService(
        SqliteSubscriptionRepository(db), WebPushSender(settings.state_dir), directory, daemon_name, tokens.exists
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        tasks: list[asyncio.Task[None]] = []
        if run_loops:
            loops = {
                "monitor": monitor.run_loop(bus, settings.tick_seconds),
                "push": push.run_loop(bus),
                "turns": TurnWatcher(marks.finished).run_loop(bus, directory.list),
                "transcripts": transcripts.run_loop(bus, directory.transcript_paths),
                "auto-approve": AutoApprover(approvals, audit).run_loop(bus),
            }
            if summaries.available:

                def reply_of(session_id: str) -> str | None:
                    session = directory.find(session_id)
                    return session.last_message if session else None

                loops["summaries"] = summaries.run_loop(bus, reply_of, settings.summaries.eager)
            if concierge is not None:
                loops["concierge"] = concierge.run_loop(bus)
            if remote_control is not None:
                loops["remote-control"] = remote_control.run_loop(bus, settings.remote_control.poll_seconds)
            for name, coro in loops.items():
                task = asyncio.create_task(coro, name=name)
                task.add_done_callback(_log_crash)
                tasks.append(task)
        yield
        for task in tasks:
            task.cancel()

    app = FastAPI(title="muxtower", version=__version__, lifespan=lifespan)
    app.state.settings = settings
    app.state.daemon_name = daemon_name
    app.state.tokens = tokens
    app.state.origins = OriginPolicy(settings.cors.allowed_origins)
    app.state.bus = bus
    app.state.sessions = sessions
    app.state.monitor = monitor
    app.state.directory = directory
    app.state.summaries = summaries
    app.state.concierge = concierge
    app.state.mcp = McpTools(directory, sessions, concierge, daemon_name)
    app.state.asr = build_asr(settings, lambda: [s.name for s in directory.list()])
    app.state.terminal = terminal
    app.state.approvals = approvals
    app.state.audit = audit
    app.state.push = push
    app.state.pairing = PairingService(db, tokens, settings.pairing, daemon_name)
    app.state.stream_cookies = StreamCookieSigner(settings.state_dir)
    app.state.client_address = ClientAddress(settings.trusted_proxies)

    if settings.cors.allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors.allowed_origins,
            allow_credentials=False,  # bearer tokens only; the stream cookie is same-origin
            allow_methods=["GET", "POST", "PATCH", "DELETE"],
            allow_headers=["Authorization", "Content-Type", *settings.cors.extra_headers],
            expose_headers=list(DAEMON_AUTH_HEADER),
            max_age=600,
        )

    for error, status in (
        (NotFound, 404),
        (Invalid, 400),
        (Conflict, 409),
        (Forbidden, 403),
        (Unauthorized, 401),
        (TooManyRequests, 429),
        (TmuxError, 502),
        (Unavailable, 502),
    ):

        def handler(_: Request, exc: Exception, status: int = status) -> JSONResponse:
            headers = DAEMON_AUTH_HEADER if status == 401 else None
            return JSONResponse({"detail": str(exc)}, status_code=status, headers=headers)

        app.add_exception_handler(error, handler)

    routers = (system_router, auth_router, sessions_router, summaries_router, asr_router, mcp_router, stream_router,
               push_router, hooks_router)  # fmt: skip
    for router in routers:
        app.include_router(router)

    if settings.serve_ui:
        mount_ui(app, settings.public_url, daemon_name)
    return app
