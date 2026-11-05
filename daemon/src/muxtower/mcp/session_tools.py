"""The MCP tools that start, rename and archive sessions: on the hub or on a device joined to it, a new one
or one resuming an agent's earlier conversation, with its role and project in a team."""

from collections.abc import Callable

from pydantic import BaseModel, Field

from muxtower.errors import Conflict, Invalid, Unavailable
from muxtower.mcp.tool import Tool
from muxtower.sessions.archiving import Archiver
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.endable import where_it_runs
from muxtower.sessions.launch import agent_may_ask
from muxtower.sessions.launcher import Launcher
from muxtower.sessions.models import CreateSession, UpdateSession
from muxtower.teams.service import TeamService

RESUME_ARGS = {"claude-code": ["--resume"], "codex": ["resume"]}  # then the agent's own id for the conversation


class StartArgs(BaseModel):
    cwd: str = Field(description="directory to work in, on the machine it starts on")
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
    project: str | None = Field(default=None, description="its project; default: worked out from its folder")
    permission_mode: str | None = Field(
        default=None,
        description="one of the runtime's permission modes (list_runtimes… see the app); never above the owner's "
        "default, nor one that asks nothing or has no sandbox; default: the owner's",
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

    def tools(self) -> list[Tool]:
        found = [
            Tool("start_session", "Start an agent session in tmux, on the hub or on another device joined to it "
                 "(machine): a new one, or one resuming an earlier conversation (resume), with its role and "
                 "project.", StartArgs, self.start_session),
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

    def start_session(self, args: StartArgs) -> str:
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
            if args.name:  # a name an agent chose for a teammate: kept like a rename (`sessions/naming.py`)
                created = self.directory.update(created.id, UpdateSession(name=args.name))
        except (Conflict, Unavailable) as exc:
            if node is None:
                raise
            raise type(exc)(f"could not start it on {node}: {exc}") from exc
        team = ""
        if self.teams is not None:
            if args.resume:
                self.teams.resumed(created.id, args.resume)
            if args.role:
                self.teams.set_role(created.id, args.role, None)
            if args.project:
                self.teams.set_project(created.id, args.project)
            m = self.teams.member(created)
            team = f" Role: {m.role or 'none yet'}; project {m.project}."
        return f"Started {created.name} ({created.id}) on {node or self.hub} in {created.cwd}.{team}"

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
