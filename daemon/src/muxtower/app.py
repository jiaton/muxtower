"""FastAPI application factory: builds adapters and services, keeps them on app.state, starts loops."""

import asyncio
import logging
import socket
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from muxtower import __version__
from muxtower.agents.accounts import Accounts
from muxtower.agents.codex.processes import CodexProcesses
from muxtower.agents.processes import AgentProcesses
from muxtower.approval.auto import AutoApprover
from muxtower.approval.service import ApprovalService
from muxtower.asr.routes import router as asr_router
from muxtower.auth.deps import DAEMON_AUTH_HEADER
from muxtower.auth.pairing import PairingService
from muxtower.auth.routes import router as auth_router
from muxtower.auth.stream_cookie import StreamCookieSigner
from muxtower.builders import (
    build_asr,
    build_codex,
    build_remote_control,
    build_summaries,
    build_token_service,
)
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
from muxtower.nodes import protocol as node_protocol
from muxtower.nodes.api import NodeApi
from muxtower.nodes.client import HubClient
from muxtower.nodes.directory import HubDirectory
from muxtower.nodes.hub import Nodes
from muxtower.nodes.processes import NodeProcesses
from muxtower.nodes.repository import SqliteNodeRepository
from muxtower.nodes.routes import router as nodes_router
from muxtower.nodes.source import NodeSource
from muxtower.nodes.store import HubStore
from muxtower.nodes.update import Updater
from muxtower.notify.repository import SqliteSubscriptionRepository
from muxtower.notify.routes import router as push_router
from muxtower.notify.service import PushService
from muxtower.notify.webpush_sender import WebPushSender
from muxtower.origins import OriginPolicy
from muxtower.runtimes.spec import load_runtimes
from muxtower.sessions.archive import SessionArchive
from muxtower.sessions.archive_repository import SqliteArchiveRepository
from muxtower.sessions.archiving import Archiver
from muxtower.sessions.claude_processes import ClaudeProcesses
from muxtower.sessions.launcher import Launcher
from muxtower.sessions.marks import SessionMarks, SqliteMarksRepository
from muxtower.sessions.monitor import Monitor
from muxtower.sessions.placement import Placements
from muxtower.sessions.ports import SessionSourcePort
from muxtower.sessions.repository import SqliteSessionRepository
from muxtower.sessions.routes import router as sessions_router
from muxtower.sessions.service import SessionConfig, SessionService
from muxtower.sessions.transcripts import Transcripts
from muxtower.sessions.turns import TurnWatcher
from muxtower.sources.codex.service import CodexSource
from muxtower.sources.remote_control.service import RemoteControlSource
from muxtower.summaries.routes import router as summaries_router
from muxtower.system.routes import router as system_router
from muxtower.terminal.ports import TmuxPort
from muxtower.terminal.service import TerminalService
from muxtower.terminal.stream import router as stream_router
from muxtower.web import mount_ui

logger = logging.getLogger("muxtower")


def _log_crash(task: asyncio.Task[None]) -> None:
    if not task.cancelled() and task.exception() is not None:
        logger.error("background task %s crashed", task.get_name(), exc_info=task.exception())


def create_app(
    settings: Settings,
    tmux: TmuxPort | None = None,
    run_loops: bool = True,
    remote_control: RemoteControlSource | None = None,
    codex: CodexSource | None = None,
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
    codex = codex or build_codex(settings)
    sources: list[SessionSourcePort] = [s for s in (remote_control, codex) if s is not None]
    # Links panes to their agent's session: Remote Control, transcript, name (one plugin per agent).
    processes = AgentProcesses([ClaudeProcesses(), CodexProcesses()])
    monitor = Monitor(sessions, processes)
    approvals = ApprovalService(sessions)
    terminal = TerminalService(sessions, monitor)
    summaries = build_summaries(settings, db)
    marks = SessionMarks(SqliteMarksRepository(db))
    transcripts = Transcripts()
    archive = SessionArchive(SqliteArchiveRepository(db), transcripts)
    audit = AuditLog(db)
    # Daemons joined to this one (nodes): their sessions are one more source.
    nodes = Nodes(SqliteNodeRepository(db), bus)
    node_sessions = NodeSource(nodes)
    node_processes = NodeProcesses(nodes)  # where the Remote Control sessions listed here run, if on a node
    processes.plugins.append(node_processes)
    directory = HubDirectory(
        sessions, terminal, approvals, sources, summaries, daemon_name, processes,
        marks, transcripts, archive, Accounts(), nodes=node_sessions, node_processes=node_processes,
    )  # fmt: skip
    launcher = Launcher(directory, [codex] if codex else [], node_sessions)
    archiver = Archiver(directory, archive)
    placements = Placements(directory, marks)
    # This daemon as a node of a hub, once it joined one (`muxtower pair --join`).
    hub = HubClient(
        HubStore(settings.state_dir / "hub.json"), settings.hub.headers,
        NodeApi(directory, launcher, archiver, placements, audit, processes), monitor, bus,
        lambda: node_protocol.Hello(
            protocol=node_protocol.PROTOCOL, name=daemon_name, version=__version__, runtimes=launcher.runtimes(),
            platform=sys.platform,
        ),
        Updater(settings.hub.update),
    )  # fmt: skip
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
            if codex is not None:
                loops["codex"] = codex.run_loop(bus)
            loops["hub"] = hub.run_loop()
            for name, coro in loops.items():
                task = asyncio.create_task(coro, name=name)
                task.add_done_callback(_log_crash)
                tasks.append(task)
        yield
        for task in tasks:
            task.cancel()
        if codex is not None:
            codex.port.close()

    app = FastAPI(title="muxtower", version="1", lifespan=lifespan)  # the API's (/v1): a release leaves the contract be
    app.state.settings = settings
    app.state.daemon_name = daemon_name
    app.state.tokens = tokens
    app.state.origins = OriginPolicy(settings.cors.allowed_origins)
    app.state.bus = bus
    app.state.sessions = sessions
    app.state.monitor = monitor
    app.state.directory = directory
    app.state.placements = placements
    app.state.archiver = archiver
    app.state.launcher = launcher
    app.state.nodes = nodes
    app.state.hub = hub
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

    errors = ((NotFound, 404), (Invalid, 400), (Conflict, 409), (Forbidden, 403), (Unauthorized, 401),
              (TooManyRequests, 429), (TmuxError, 502), (Unavailable, 502))  # fmt: skip
    for error, status in errors:

        def handler(_: Request, exc: Exception, status: int = status) -> JSONResponse:
            headers = DAEMON_AUTH_HEADER if status == 401 else None
            return JSONResponse({"detail": str(exc)}, status_code=status, headers=headers)

        app.add_exception_handler(error, handler)

    routers = (system_router, auth_router, sessions_router, summaries_router, asr_router, mcp_router, stream_router,
               push_router, hooks_router, nodes_router)  # fmt: skip
    for router in routers:
        app.include_router(router)

    if settings.serve_ui:
        mount_ui(app, settings.public_url, daemon_name)
    return app
