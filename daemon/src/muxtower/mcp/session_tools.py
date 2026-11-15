"""The MCP tools that start, rename and archive sessions: on the hub or on a device joined to it, a new one
or one resuming an agent's earlier conversation, with its role and project in a team."""

import hashlib
import json
import threading
import time
from collections.abc import Callable

from pydantic import BaseModel, Field

from muxtower.errors import Conflict, Invalid, NotFound, Unavailable
from muxtower.infra.audit import AuditLog
from muxtower.mcp.caller import CALLER
from muxtower.mcp.tool import Tool
from muxtower.sessions.archiving import Archiver
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.endable import where_it_runs
from muxtower.sessions.launch import agent_may_ask
from muxtower.sessions.launcher import Launcher
from muxtower.sessions.models import CreateSession, UpdateSession
from muxtower.teams.service import TeamService

RESUME_ARGS = {"claude-code": ["--resume"], "codex": ["resume"]}  # then the agent's own id for the conversation
SAME_START_SECONDS = 120.0  # the same start asked again within this gets the session already started


class StartArgs(BaseModel):
    cwd: str | None = Field(
        default=None,
        description="directory to work in, on the machine it starts on; omit cwd for the machine's default folder "
        "(my_team says each machine's)",
    )
    prompt: str | None = Field(default=None, description="first message for the new agent")
    name: str | None = None
    runtime: str = Field(default="claude-code", description="claude-code, codex, …")
    machine: str | None = Field(
        default=None,
        description="the machine to start it on: any list_sessions shows (@name); default: the one you run on",
    )
    resume: str | None = Field(
        default=None,
        description="resume this conversation (Claude Code's session id, Codex's thread id) instead of a new "
        "one; it keeps the role and project it had",
    )
    role: str | None = Field(default=None, description="its role in its team (free text)")
    project: str | None = Field(
        default=None,
        description=(
            "its project; to start a teammate, copy your project's exact name from my_team (e.g. owner/repo); "
            "any other spelling makes a new project; default: worked out from its folder"
        ),
    )
    permission_mode: str | None = Field(
        default=None,
        description="one of the runtime's permission modes (list_runtimes… see the app); never above the owner's "
        "default, nor one that asks nothing or has no sandbox; default: the owner's",
    )
    idempotency_key: str | None = Field(
        default=None,
        description="optional: a start asked again with the same key (or by you with the same arguments) within "
        "2 minutes returns the session already started, never a second one",
    )


class RenameArgs(BaseModel):
    session_id: str = Field(description="from list_sessions")
    name: str = Field(min_length=1, max_length=80)


class ArchiveArgs(BaseModel):
    session_id: str = Field(description="from list_sessions")


class SessionTools:
    def __init__(
        self, directory: SessionDirectory, launcher: Launcher, hub: str, machines: Callable[[], list[str]] = list,
        teams: TeamService | None = None, archiver: Archiver | None = None,
    ) -> None:  # fmt: skip
        self.directory = directory
        self.launcher = launcher
        self.hub = hub
        self.machines = machines  # the names of the nodes joined to this hub
        self.teams = teams
        self.archiver = archiver
        self.may_escalate: Callable[[], bool] = lambda: False  # `launch.agents_may_escalate`, set by the app
        self.audit: AuditLog | None = None  # set by the app: every start is recorded, however it ends
        self.clock: Callable[[], float] = time.monotonic
        self._lock = threading.Lock()
        self._starting: dict[str, threading.Lock] = {}  # one start per key at a time
        self._started: dict[str, tuple[float, str]] = {}  # key → (when, the session it started)

    def tools(self) -> list[Tool]:
        found = [
            Tool("start_session", "Start an agent session in tmux, on the hub or on another device joined to it "
                 "(machine): a new one, or one resuming an earlier conversation (resume), with its role and "
                 "project. Omit cwd for the machine's default folder. Returns once it runs; the first message "
                 "(prompt) is its first input, not waited for. Asking again with the same arguments within 2 "
                 "minutes returns the session already started. If a start reports an error, check list_sessions "
                 "before retrying.", StartArgs, self.start_session),
            Tool("rename_session", "Rename a session.", RenameArgs, self.rename_session),
        ]  # fmt: skip
        if self.archiver is not None:
            found.append(
                Tool("archive_session", "Archive a session: its agent ends, and it is kept to read (Archived).",
                     ArchiveArgs, self.archive_session)
            )  # fmt: skip
        return found

    def _node(self, machine: str | None) -> str | None:
        """The node a machine name means (None: the hub itself), however the caller capitalised it."""
        wanted = (machine or "").strip().removeprefix("@").lower()
        if not wanted or wanted == self.hub.lower():
            return None
        nodes = self.machines()
        found = next((n for n in nodes if n.lower() == wanted), None)
        if found is None:
            known = ", ".join([self.hub, *nodes])
            raise Invalid(f"no device named {machine}; start it on one of: {known}")
        return found

    def key_of(self, args: StartArgs) -> str:
        """What makes two starts the same: the key given, else the caller and every argument."""
        if args.idempotency_key:
            return f"key:{args.idempotency_key}"
        asked = args.model_dump(exclude={"idempotency_key"})
        body = json.dumps([CALLER.get().session_id or CALLER.get().actor, asked], sort_keys=True, ensure_ascii=False)
        return "args:" + hashlib.sha256(body.encode()).hexdigest()

    def start_session(self, args: StartArgs) -> str:
        """Starts it, or (the same start asked again: a caller retrying one it took for failed) returns the
        session that start made. Once a session exists the call never fails: what could not be done after
        (its name, role, project) is said in the answer instead."""
        key = self.key_of(args)
        with self._lock:
            now = self.clock()
            self._started = {k: v for k, v in self._started.items() if now - v[0] < SAME_START_SECONDS}
            gate = self._starting.setdefault(key, threading.Lock())
        started = self.clock()
        outcome, session_id = "error", None
        try:
            with gate:  # the same start asked twice at once: the second waits, then finds the first's session
                if (earlier := self._started.get(key)) is not None and (again := self._already(earlier[1])):
                    outcome, session_id = "already started", earlier[1]
                    return again
                text, session_id = self._start(args)
                self._started[key] = (self.clock(), session_id)
                outcome = "started"
                return text
        finally:
            if self.audit is not None:
                where = args.machine or self.hub
                took = self.clock() - started
                detail = f"machine={where} cwd={args.cwd or '-'} outcome={outcome} took={took:.1f}s"
                self.audit.record(CALLER.get().actor, "mcp:start_session", session_id, detail)

    def _already(self, session_id: str) -> str | None:
        try:
            s = self.directory.get(session_id)
        except NotFound:
            return None  # gone since: a start asked again is a new one
        where = s.node or self.hub
        return (
            f"Already started {s.name} ({s.id}) on {where} in {s.cwd}: the same start was asked within the last "
            "2 minutes, so no second session was started."
        )

    def _start(self, args: StartArgs) -> tuple[str, str]:
        node = self._node(args.machine)
        agent_args: list[str] = []
        if args.resume:
            resume = RESUME_ARGS.get(args.runtime)
            if resume is None:
                raise Invalid(f"{args.runtime} sessions cannot be resumed from here")
            agent_args = [*resume, args.resume, *agent_args]
        if args.permission_mode:  # never above what the owner set up (`sessions/launch.py`)
            local = self.directory.local
            runtime = local.resolve_runtime(args.runtime)
            agent_may_ask(
                runtime.config, args.permission_mode, local.launch_defaults(runtime.name)[0], self.may_escalate()
            )
        request = CreateSession(
            runtime=args.runtime, cwd=args.cwd, name=args.name, args=agent_args, prompt=args.prompt, node=node,
            permission_mode=args.permission_mode,
        )  # fmt: skip
        try:
            created = self.launcher.create(request)
        except (Conflict, Unavailable) as exc:
            if node is None:
                raise
            raise type(exc)(f"could not start it on {node}: {exc}") from exc
        # It runs: from here nothing fails the call (a caller told it failed starts it again: a duplicate).
        notes: list[str] = []
        if args.name:  # a name an agent chose for a teammate: kept like a rename (`sessions/naming.py`)
            try:
                created = self.directory.update(created.id, UpdateSession(name=args.name))
            except Exception as exc:  # noqa: BLE001 - said in the answer, the session stays
                notes.append(f"its name was not set ({exc}): rename_session")
        team = ""
        if self.teams is not None:
            try:
                if args.resume:
                    self.teams.resumed(created.id, args.resume)
                if args.role:
                    self.teams.set_role(created.id, args.role, None)
                if args.project:
                    self.teams.set_project(created.id, args.project)
                m = self.teams.member(created)
                team = f" Role: {m.role or 'none yet'}; project {m.project}."
            except Exception as exc:  # noqa: BLE001 - said in the answer, the session stays
                notes.append(f"its role or project was not set ({exc}): set_role, set_project")
        default = "" if args.cwd else " (the machine's default folder)"
        note = "".join(f" NOTE: {n}." for n in notes)
        text = f"Started {created.name} ({created.id}) on {node or self.hub} in {created.cwd}{default}.{team}{note}"
        return text, created.id

    def rename_session(self, args: RenameArgs) -> str:
        session = self.directory.update(args.session_id, UpdateSession(name=args.name))
        return f"Renamed {session.id} to {session.name}."

    def archive_session(self, args: ArchiveArgs) -> str:
        assert self.archiver is not None
        session = self.directory.get(args.session_id)
        if not self.archiver.archive(args.session_id):
            return (
                f"Hidden {session.id} in muxtower, not archived: it runs in {where_it_runs(session)}, which muxtower "
                f"cannot end, so it goes on there. To end it, do so in {where_it_runs(session)}."
            )
        return f"Archived {args.session_id}: its agent has ended; it is kept to read under Archived."
