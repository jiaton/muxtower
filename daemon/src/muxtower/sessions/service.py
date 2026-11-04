"""Session lifecycle and views: create, list, rename, terminate, hook ingestion."""

import hashlib
import os
import secrets
import time
import uuid
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from muxtower.errors import Conflict, Invalid, NotFound, Unauthorized
from muxtower.hooks.events import HookEvent, apply_event
from muxtower.hooks.harnesses import harness
from muxtower.hooks.ports import MCP_SERVER, MCP_TOKEN_ENV, HookLaunch
from muxtower.runtimes.models import ATTENTION_STATES, AgentState
from muxtower.runtimes.spec import Runtime
from muxtower.sessions.interrupted import agent_id_of, launch_options
from muxtower.sessions.live import Effective, HookState, LiveSession, merge
from muxtower.sessions.models import CreateSession, Session, UpdateSession
from muxtower.sessions.ports import SessionRecord, SessionRepository, SessionSource
from muxtower.sessions.views import session_view
from muxtower.terminal.ports import TmuxPort

DEFAULT_COLS, DEFAULT_ROWS = 120, 40


@dataclass(frozen=True)
class SessionConfig:
    socket: str
    adopt_sockets: list[str]
    local_url: str
    state_dir: Path


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _brings_mcp(args: Sequence[str]) -> bool:
    return any(a == "--mcp-config" or a.startswith("--mcp-config=") or f"mcp_servers.{MCP_SERVER}" in a for a in args)


class SessionService:
    def __init__(
        self,
        repo: SessionRepository,
        tmux: TmuxPort,
        runtimes: dict[str, Runtime],
        config: SessionConfig,
    ) -> None:
        self.repo = repo
        self.tmux = tmux
        self.runtimes = runtimes
        self.config = config
        self.live: dict[str, LiveSession] = {}
        self.gone: Callable[[str], None] = lambda _: None  # it ended or was interrupted (writes/)

    # --- views ---------------------------------------------------------------------------------

    def record(self, session_id: str) -> SessionRecord:
        record = self.repo.get(session_id)
        if record is None:
            raise NotFound(f"unknown session {session_id}")
        return record

    def runtime_of(self, record: SessionRecord) -> Runtime | None:
        return self.runtimes.get(record.runtime)

    def live_of(self, session_id: str) -> LiveSession:
        """In-memory state for a session; after a restart, seeded with the last hook state on disk."""
        live = self.live.get(session_id)
        if live is None:
            live = self.live[session_id] = LiveSession()
            raw = self.repo.load_hook_state(session_id)
            if raw:
                live.hook = HookState.load(raw)
                live.last_message = live.hook.last_message
                # Last active when its last hook fired, not when this daemon started.
                live.updated_at = datetime.now(UTC) - timedelta(seconds=time.monotonic() - live.hook.at)
        return live

    def effective(self, record: SessionRecord) -> Effective:
        live = self.live_of(record.id)
        if live.effective is None:
            live.effective = self._merge(record, live)
        return live.effective

    def _merge(self, record: SessionRecord, live: LiveSession) -> Effective:
        runtime = self.runtime_of(record)
        stale = runtime.config.busy_stale_seconds if runtime else 0.0
        return merge(live.hook, live.screen, time.monotonic(), stale)

    def view(self, record: SessionRecord) -> Session:
        return session_view(self, record)

    def list(self) -> list[Session]:
        return [self.view(r) for r in self.repo.list()]

    def transcript_of(self, session_id: str) -> str | None:
        return self.live_of(session_id).transcript

    def get(self, session_id: str) -> Session:
        return self.view(self.record(session_id))

    # --- lifecycle -----------------------------------------------------------------------------

    def resolve_runtime(self, name_or_binary: str) -> Runtime:
        for runtime in self.runtimes.values():
            if name_or_binary in (runtime.name, runtime.config.binary):
                return runtime
        known = ", ".join(sorted(self.runtimes))
        raise Invalid(f"unknown runtime {name_or_binary!r}; known: {known}")

    def create(self, request: CreateSession) -> Session:
        runtime = self.resolve_runtime(request.runtime)
        cwd = os.path.abspath(os.path.expanduser(request.cwd))
        if not os.path.isdir(cwd):
            raise Invalid(f"not a directory: {cwd}")
        return self.launch(runtime, cwd, request.args, request.name, hooks=True)

    def launch(
        self, runtime: Runtime, cwd: str, args: Sequence[str], name: str | None, hooks: bool,
        again: SessionRecord | None = None,
    ) -> Session:  # fmt: skip
        """Starts the runtime's binary with `args` in a tmux session of its own; with its hooks, if it has
        them, reporting to this daemon. `again`: an interrupted session started again under its own id
        (its name, marks and team stay with it)."""
        if not self.tmux.installed():
            raise Conflict(
                "tmux is not installed here (not on the PATH muxtower runs with): install it, "
                "e.g. `brew install tmux` on a Mac, and restart muxtower"
            )
        if not self.tmux.finds(self.config.socket, runtime.config.binary):
            raise Conflict(f"{runtime.config.binary} is not installed here (not on the PATH tmux runs agents with)")
        session_id = again.id if again else uuid.uuid4().hex[:12]
        hook_token = secrets.token_urlsafe(24)
        argv = [runtime.config.binary]
        env = {"MUXTOWER_SESSION_ID": session_id, "MUXTOWER_HOOK_TOKEN": hook_token}
        if hooks and (harnessed := harness(runtime.config.hooks)):
            url = f"{self.config.local_url}/v1/hooks/{harnessed.name}"
            # muxtower's MCP too, reached as this session, unless its arguments bring their own (the concierge)
            mcp = None if _brings_mcp(args) else f"{self.config.local_url}/v1/mcp"
            launch = HookLaunch(session_id, hook_token, url, self.hook_files, mcp)
            argv += harnessed.launch_args(launch)
            if mcp:
                env[MCP_TOKEN_ENV] = launch.mcp_token
        argv += args

        tmux_session = f"mxt-{session_id[:8]}"
        pane = self.tmux.new_session(self.config.socket, tmux_session, cwd, argv, env, DEFAULT_COLS, DEFAULT_ROWS)
        record = SessionRecord(
            id=session_id,
            name=again.name if again else name or os.path.basename(cwd.rstrip("/")) or cwd,
            runtime=runtime.name,
            cwd=cwd,
            source=SessionSource.LAUNCHED,
            pane=pane,
            tmux_session=tmux_session,
            hook_token_hash=_hash(hook_token),
            auto_approve=again.auto_approve if again else False,
            created_at=again.created_at if again else datetime.now(UTC),
            named=again.named if again else False,  # a name given at launch is no rename (`naming.py`)
            named_at=again.named_at if again else (datetime.now(UTC) if name else None),
            launch_args=again.launch_args if again else launch_options(list(args), runtime.config),
            agent_id=again.agent_id if again else None,
            server_id=self.tmux.server_id(self.config.socket),
        )
        self.repo.upsert(record)
        if again:  # what it was before it was interrupted is no more
            self.repo.save_hook_state(session_id, None)
            self.live.pop(session_id, None)
        return self.view(record)

    def update(self, session_id: str, patch: UpdateSession) -> Session:
        record = self.record(session_id)
        if patch.name is not None:
            record.name = patch.name
            record.named, record.named_at = True, datetime.now(UTC)
        if patch.auto_approve is not None:
            runtime = self.runtime_of(record)
            if patch.auto_approve and not (runtime and runtime.config.auto_approve_states):
                raise Invalid(f"runtime {record.runtime!r} has no auto-approvable states")
            record.auto_approve = patch.auto_approve
        self.repo.upsert(record)
        return self.view(record)

    def terminate(self, session_id: str) -> None:
        if self.record(session_id).interrupted_at:  # nothing runs: only its record goes
            self.forget(session_id)
            return
        if self.record(session_id).source != SessionSource.LAUNCHED:
            raise Conflict("this session was not started by muxtower; stop it from its own terminal")
        self.close(session_id)

    def close(self, session_id: str) -> None:
        """Ends the agent: muxtower's own tmux session, or the pane it was found running in."""
        record = self.record(session_id)
        if record.source == SessionSource.LAUNCHED:
            self.tmux.kill_session(record.pane.socket, record.tmux_session)
        else:
            self.tmux.kill_pane(record.pane)
        self.forget(record.id)

    def interrupt(self, record: SessionRecord) -> None:
        """Its machine restarted under it: kept, with what starts it again, until resumed or removed."""
        record.interrupted_at = datetime.now(UTC)
        self.repo.upsert(record)
        self.live.pop(record.id, None)
        self.gone(record.id)

    def know_agent(self, record: SessionRecord, transcript: str | None) -> None:
        """The agent's own id for its conversation, from its transcript's name: what resumes it."""
        if (agent := agent_id_of(transcript)) and agent != record.agent_id:
            record.agent_id = agent
            self.repo.upsert(record)

    def forget(self, session_id: str) -> None:
        self.repo.delete(session_id)
        self.live.pop(session_id, None)
        self.gone(session_id)
        for hook_file in self.hook_files.glob(f"{session_id}.*"):
            hook_file.unlink(missing_ok=True)

    # --- hooks ---------------------------------------------------------------------------------

    @property
    def hook_files(self) -> Path:
        """Where harnesses keep the files they write for a session's hooks, named after its id."""
        return self.config.state_dir / "hooks"

    def holds_token(self, session_id: str, hook_token: str) -> bool:
        """Whether `hook_token` is the one this session was started with."""
        record = self.repo.get(session_id)
        if record is None or record.hook_token_hash is None:
            return False
        return secrets.compare_digest(record.hook_token_hash, _hash(hook_token))

    def apply_hook(self, session_id: str, hook_token: str, event: HookEvent) -> bool:
        """Returns True when the session entered an attention state."""
        record = self.repo.get(session_id)
        if record is None or record.hook_token_hash is None:
            raise NotFound("unknown session")
        if not self.holds_token(session_id, hook_token):
            raise Unauthorized("bad hook token")
        live = self.live_of(session_id)
        if event.transcript_path:
            live.hook_transcript = event.transcript_path
        before = self.effective(record).state
        hooks = harness(runtime.config.hooks) if (runtime := self.runtime_of(record)) else None
        live.hook = apply_event(live.hook, event, hooks.asking) if hooks else apply_event(live.hook, event)
        if live.hook is not None and live.hook.last_message:
            live.last_message = live.hook.last_message
        self.repo.save_hook_state(session_id, live.hook.dump() if live.hook else None)
        return self.refresh(record, live, before)

    def refresh(self, record: SessionRecord, live: LiveSession, before: AgentState) -> bool:
        effective = self._merge(record, live)
        if effective != live.effective:
            live.updated_at = datetime.now(UTC)
        live.effective = effective
        after = effective.state
        return after != before and after in ATTENTION_STATES
