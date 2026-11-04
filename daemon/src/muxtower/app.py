"""FastAPI application factory: builds adapters and services, keeps them on app.state, starts loops."""

import asyncio
import logging
import socket
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from muxtower import __version__
from muxtower.agents.accounts import Accounts
from muxtower.agents.codex.processes import CodexProcesses
from muxtower.agents.processes import AgentProcesses
from muxtower.approval.auto import AutoApprover
from muxtower.approval.service import ApprovalService
from muxtower.auth.pairing import PairingService
from muxtower.auth.stream_cookie import StreamCookieSigner
from muxtower.builders import (
    build_asr,
    build_codex,
    build_codex_shared,
    build_remote_control,
    build_summaries,
    build_token_service,
)
from muxtower.concierge.events_repository import SqliteConciergeEvents
from muxtower.concierge.service import ConciergeService
from muxtower.concierge.store import FileConciergeStore
from muxtower.config import Settings
from muxtower.infra.audit import AuditLog
from muxtower.infra.bus import EventBus
from muxtower.infra.db import Database
from muxtower.infra.tmux import TmuxCli
from muxtower.mcp.service import McpTools
from muxtower.net import ClientAddress
from muxtower.nodes import protocol as node_protocol
from muxtower.nodes.api import NodeApi
from muxtower.nodes.client import HubClient
from muxtower.nodes.direct import DirectAccess, app_origins, tailscale_url, usable
from muxtower.nodes.directory import HubDirectory
from muxtower.nodes.hub import Nodes
from muxtower.nodes.processes import NodeProcesses
from muxtower.nodes.repository import SqliteNodeRepository
from muxtower.nodes.source import NodeSource
from muxtower.nodes.store import HubStore
from muxtower.nodes.update import Updater
from muxtower.notify.repository import SqliteSubscriptionRepository
from muxtower.notify.service import PushService
from muxtower.notify.webpush_sender import WebPushSender, subject
from muxtower.origins import OriginPolicy
from muxtower.recovery.service import RecoveryService
from muxtower.runtimes.spec import load_runtimes
from muxtower.serving import serve
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
from muxtower.sessions.service import SessionConfig, SessionService
from muxtower.sessions.transcripts import Transcripts
from muxtower.sessions.turns import TurnWatcher
from muxtower.settings.service import SettingsService
from muxtower.sources.codex.service import CodexSource
from muxtower.sources.codex.shared import SharedCodexSource
from muxtower.sources.remote_control.service import RemoteControlSource
from muxtower.teams import placing
from muxtower.teams.repository import SqliteTaskRepository, SqliteTeamRepository
from muxtower.teams.service import TeamService
from muxtower.teams.tasks import TaskService
from muxtower.terminal.images import ImageDrop
from muxtower.terminal.ports import TmuxPort
from muxtower.terminal.service import TerminalService
from muxtower.usage.sampler import UsageSampler
from muxtower.writes.tracker import WriteTracker, Writing

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
    codex_shared: SharedCodexSource | None = None,
) -> FastAPI:
    db = Database(settings.db_path)
    tokens = build_token_service(settings, db)  # migrates the database first
    feature_settings = SettingsService(settings, db)  # the app's changes, before anything reads them
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
    codex_shared = codex_shared or build_codex_shared(settings)
    sources: list[SessionSourcePort] = [s for s in (remote_control, codex, codex_shared) if s is not None]
    # Links panes to their agent's session: Remote Control, transcript, name (one plugin per agent).
    processes = AgentProcesses([ClaudeProcesses(), CodexProcesses(shared=codex_shared is not None)])
    monitor = Monitor(sessions, processes)
    approvals = ApprovalService(sessions)
    terminal = TerminalService(sessions, monitor, ImageDrop(settings.state_dir / "images"))
    summaries = build_summaries(settings, db)
    marks = SessionMarks(SqliteMarksRepository(db))
    transcripts = Transcripts()
    archive = SessionArchive(SqliteArchiveRepository(db), transcripts, lambda: settings.archive.hide_after_days)
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
    recovery = RecoveryService(
        sessions, settings.recovery, lambda sid: isinstance(directory.source_of(sid), NodeSource),
        node_sessions.recover,
    )  # fmt: skip
    usage = UsageSampler(
        daemon_name, settings.usage, lambda: list(monitor.timings),
        lambda sid: session.name if (session := directory.find(sid)) else None,
    )  # fmt: skip
    node_api = NodeApi(directory, launcher, archiver, placements, audit, processes)
    node_api.usage_now = lambda: usage.current
    node_api.recover = recovery.recover
    node_api.settings = feature_settings
    node_api.tokens = tokens
    direct_url = usable(settings.public_url) or tailscale_url(settings.port)  # where the app reaches it itself
    hub_store = HubStore(settings.state_dir / "hub.json")
    hub = HubClient(
        hub_store, settings.hub.headers, node_api, monitor, bus,
        lambda: node_protocol.Hello(
            protocol=node_protocol.PROTOCOL, oldest=node_protocol.OLDEST, name=daemon_name, version=__version__,
            runtimes=launcher.runtimes(), platform=sys.platform, url=direct_url,
        ),
        Updater(settings.hub.update),
    )  # fmt: skip
    concierge: ConciergeService | None = None
    if settings.concierge.enabled:
        store = FileConciergeStore(settings.state_dir / "concierge.json", settings.state_dir / "concierge")
        mcp_url = f"{settings.local_url}/v1/mcp"
        events = SqliteConciergeEvents(db)
        concierge = ConciergeService(settings.concierge, sessions, directory, tokens, store, events, mcp_url)
    sender = WebPushSender(settings.state_dir, subject(settings.push_contact, settings.public_url))
    push = PushService(SqliteSubscriptionRepository(db), sender, directory, daemon_name, tokens.exists)

    teams = TeamService(directory, SqliteTeamRepository(db), transcript_of=directory.local.transcript_of)
    writes = WriteTracker(lambda: settings.writes.window_minutes, teams.checkouts)
    sessions.gone = writes.forget
    directory.writing = Writing(writes, lambda sid: r.name if (r := sessions.repo.get(sid)) else None).of
    team_tasks = TaskService(teams, directory, SqliteTaskRepository(db))

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
                "team-tasks": team_tasks.run_loop(bus),
                "team-places": placing.run_loop(teams, bus),
                "usage": usage.run_loop(),
                "recovery": recovery.run_loop(bus),
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
            if codex_shared is not None:
                loops["codex-shared"] = codex_shared.run_loop(bus)
            loops["hub"] = hub.run_loop()
            for name, coro in loops.items():
                task = asyncio.create_task(coro, name=name)
                task.add_done_callback(_log_crash)
                tasks.append(task)
        yield
        for task in tasks:
            task.cancel()
        for source in (codex, codex_shared):
            if source is not None:
                source.port.close()

    app = FastAPI(title="muxtower", version="1", lifespan=lifespan)  # the API's (/v1): a release leaves the contract be
    joined = hub_store.load()
    allowed_origins = app_origins(settings.cors.allowed_origins, joined.url if joined else None)
    teams.changed = lambda: bus.publish("sessions", None)
    mcp = McpTools(
        directory, launcher, concierge, daemon_name, lambda: list(nodes.all()), teams, team_tasks, archiver,
        forward=hub.team_tool,
    )  # fmt: skip
    state = dict(
        settings=settings, daemon_name=daemon_name, tokens=tokens, origins=OriginPolicy(allowed_origins), bus=bus,
        sessions=sessions, monitor=monitor, directory=directory, remote_control=remote_control,
        placements=placements, archiver=archiver, launcher=launcher, nodes=nodes, hub=hub, summaries=summaries,
        concierge=concierge, teams=teams, team_tasks=team_tasks, usage=usage, recovery=recovery, writes=writes,
        direct=DirectAccess(nodes, node_sessions.call), feature_settings=feature_settings,
        node_sessions=node_sessions, mcp=mcp, asr=build_asr(settings, lambda: [s.name for s in directory.list()]),
        terminal=terminal, approvals=approvals, audit=audit, push=push,
        pairing=PairingService(db, tokens, settings.pairing, daemon_name),
        stream_cookies=StreamCookieSigner(settings.state_dir), client_address=ClientAddress(settings.trusted_proxies),
    )  # fmt: skip
    for key, value in state.items():
        setattr(app.state, key, value)

    serve(app, settings, allowed_origins, daemon_name)
    return app
