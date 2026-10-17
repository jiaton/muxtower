"""FastAPI application factory: builds adapters and services, keeps them on app.state, starts loops."""

import asyncio
import logging
import secrets
import socket
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from muxtower import __version__
from muxtower.approval.auto import AutoApprover
from muxtower.approval.service import ApprovalService
from muxtower.auth.deps import DAEMON_AUTH_HEADER
from muxtower.auth.pairing import PairingService
from muxtower.auth.repository import SqliteTokenRepository
from muxtower.auth.routes import router as auth_router
from muxtower.auth.service import TokenService
from muxtower.auth.stream_cookie import StreamCookieSigner
from muxtower.config import Settings
from muxtower.errors import Conflict, Forbidden, Invalid, NotFound, TooManyRequests, Unauthorized
from muxtower.hooks.routes import router as hooks_router
from muxtower.infra.audit import AuditLog
from muxtower.infra.bus import EventBus
from muxtower.infra.db import Database
from muxtower.infra.tmux import TmuxCli, TmuxError
from muxtower.net import ClientAddress
from muxtower.notify.repository import SqliteSubscriptionRepository
from muxtower.notify.routes import router as push_router
from muxtower.notify.service import PushService
from muxtower.notify.webpush_sender import WebPushSender
from muxtower.origins import OriginPolicy
from muxtower.runtimes.spec import load_runtimes
from muxtower.sessions.monitor import Monitor
from muxtower.sessions.repository import SqliteSessionRepository
from muxtower.sessions.routes import router as sessions_router
from muxtower.sessions.service import SessionConfig, SessionService
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


def _log_crash(task: asyncio.Task[None]) -> None:
    if not task.cancelled() and task.exception() is not None:
        logger.error("background task %s crashed", task.get_name(), exc_info=task.exception())


def create_app(settings: Settings, tmux: TmuxPort | None = None, run_loops: bool = True) -> FastAPI:
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
    monitor = Monitor(sessions)
    approvals = ApprovalService(sessions)
    audit = AuditLog(db)
    push = PushService(SqliteSubscriptionRepository(db), WebPushSender(settings.state_dir), sessions, daemon_name)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        tasks: list[asyncio.Task[None]] = []
        if run_loops:
            loops = {
                "monitor": monitor.run_loop(bus, settings.tick_seconds),
                "push": push.run_loop(bus),
                "auto-approve": AutoApprover(approvals, audit).run_loop(bus),
            }
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
    app.state.terminal = TerminalService(sessions, monitor)
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
            allow_headers=["Authorization", "Content-Type"],
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
    ):

        def handler(_: Request, exc: Exception, status: int = status) -> JSONResponse:
            headers = DAEMON_AUTH_HEADER if status == 401 else None
            return JSONResponse({"detail": str(exc)}, status_code=status, headers=headers)

        app.add_exception_handler(error, handler)

    for router in (system_router, auth_router, sessions_router, stream_router, push_router, hooks_router):
        app.include_router(router)

    if settings.serve_ui:
        mount_ui(app, settings.public_url, daemon_name)
    return app
