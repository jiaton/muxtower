"""Session lifecycle and views: create, list, rename, terminate, hook ingestion."""

import hashlib
import os
import secrets
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from muxtower.errors import Conflict, Invalid, NotFound, Unauthorized
from muxtower.hooks.events import HookEvent, apply_event
from muxtower.hooks.harnesses import harness
from muxtower.hooks.ports import HookLaunch
from muxtower.runtimes.models import ATTENTION_STATES, AgentState
from muxtower.runtimes.spec import Runtime
from muxtower.sessions.live import Effective, HookState, LiveSession, merge
from muxtower.sessions.models import Capabilities, CreateSession, Session, UpdateSession
from muxtower.sessions.ports import SessionRecord, SessionRepository, SessionSource
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
        live = self.live_of(record.id)
        eff = self.effective(record)
        runtime = self.runtime_of(record)
        if eff.pending is not None and runtime is not None and eff.pending.options:
            eff.pending.recommended = runtime.choose_option(eff.state, eff.pending.options)
        return Session(
            id=record.id,
            name=record.name if record.named else (live.title or record.name),  # else its tmux session's
            runtime=record.runtime,
            cwd=record.cwd,
            source=record.source,
            tmux_socket=record.pane.socket,
            tmux_session=record.tmux_session,
            tmux_pane=record.pane.pane_id,
            remote_id=live.remote_id,
            alt_screen=live.alt_screen,
            terminal_attached=live.attached,
            capabilities=Capabilities(
                screen=True,
                conversation=live.transcript is not None,  # read from its transcript
                keys=[],
                resize=True,
                rename=True,
                terminate=record.source == SessionSource.LAUNCHED,
                archive=True,
                images=True,  # saved here and pasted in as their paths
            ),  # fmt: skip
            state=eff.state,
            state_source=eff.source,
            matched_rule=eff.matched_rule,
            needs_attention=eff.state in ATTENTION_STATES,
            pending=eff.pending,
            last_message=live.last_message,
            auto_approve=record.auto_approve,
            can_auto_approve=bool(runtime and runtime.config.auto_approve_states),
            created_at=record.created_at,
            updated_at=live.updated_at,
        )

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

        session_id = uuid.uuid4().hex[:12]
        hook_token = secrets.token_urlsafe(24)
        argv = [runtime.config.binary]
        if hooks := harness(runtime.config.hooks):
            url = f"{self.config.local_url}/v1/hooks/{hooks.name}"
            argv += hooks.launch_args(HookLaunch(session_id, hook_token, url, self.hook_files))
        argv += request.args

        tmux_session = f"mxt-{session_id[:8]}"
        env = {"MUXTOWER_SESSION_ID": session_id, "MUXTOWER_HOOK_TOKEN": hook_token}
        pane = self.tmux.new_session(self.config.socket, tmux_session, cwd, argv, env, DEFAULT_COLS, DEFAULT_ROWS)
        record = SessionRecord(
            id=session_id,
            name=request.name or os.path.basename(cwd.rstrip("/")) or cwd,
            runtime=runtime.name,
            cwd=cwd,
            source=SessionSource.LAUNCHED,
            pane=pane,
            tmux_session=tmux_session,
            hook_token_hash=_hash(hook_token),
            auto_approve=False,
            created_at=datetime.now(UTC),
            named=bool(request.name),
        )
        self.repo.upsert(record)
        return self.view(record)

    def update(self, session_id: str, patch: UpdateSession) -> Session:
        record = self.record(session_id)
        if patch.name is not None:
            record.name = patch.name
            record.named = True
        if patch.auto_approve is not None:
            runtime = self.runtime_of(record)
            if patch.auto_approve and not (runtime and runtime.config.auto_approve_states):
                raise Invalid(f"runtime {record.runtime!r} has no auto-approvable states")
            record.auto_approve = patch.auto_approve
        self.repo.upsert(record)
        return self.view(record)

    def terminate(self, session_id: str) -> None:
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

    def forget(self, session_id: str) -> None:
        self.repo.delete(session_id)
        self.live.pop(session_id, None)
        for hook_file in self.hook_files.glob(f"{session_id}.*"):
            hook_file.unlink(missing_ok=True)

    # --- hooks ---------------------------------------------------------------------------------

    @property
    def hook_files(self) -> Path:
        """Where harnesses keep the files they write for a session's hooks, named after its id."""
        return self.config.state_dir / "hooks"

    def apply_hook(self, session_id: str, hook_token: str, event: HookEvent) -> bool:
        """Returns True when the session entered an attention state."""
        record = self.repo.get(session_id)
        if record is None or record.hook_token_hash is None:
            raise NotFound("unknown session")
        if not secrets.compare_digest(record.hook_token_hash, _hash(hook_token)):
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
