"""The MCP tools for teams: who the calling session is and who works with it (`my_team`), and setting a
session's role and project. A session is told apart by its own token (`caller.py`); a device's call is
answered for all projects, since it is no session."""

from collections import defaultdict
from collections.abc import Callable
from typing import Any

from pydantic import BaseModel, Field

from muxtower.errors import Invalid, Unavailable
from muxtower.mcp.caller import CALLER
from muxtower.mcp.describe import device
from muxtower.mcp.tool import Tool
from muxtower.teams.ports import Task
from muxtower.teams.service import Member, TeamService
from muxtower.teams.tasks import TaskService

UNKNOWN_CALLER = (
    "muxtower cannot tell which session you are: you reached it with a device token, not as one of the "
    "sessions it started (sessions found in tmux, or only on Remote Control, have no token of their own "
    "yet). Pass session_id to the tools that take one. Every project and who is in it:"
)

INSTRUCTIONS = """\
muxtower runs the owner's coding agent sessions, on this machine and others, and lets them work as a team.
- First call my_team: it says who you are (your session, role and project) and who else works on your
  project, with each one's role, device, state, folder and branch.
- No role yet? Ask the owner what you are for, or set the one they just gave you (set_role). A teammate
  without one can be given one the same way (set_role with its session_id).
- A role is free text and means what the owner and the agents make of it; muxtower only keeps it. Decide
  yourself whom to ask for what, by their roles and what they are doing.
- Your team is every session of your project; it has no name of its own. Your project and role stay as
  they are when you cd elsewhere or edit files in another repository.
- Wrong project? Move a session with set_project, or rename yours for all its sessions (rename=true).
- Messages that start with "[muxtower task from …]" are work a teammate sent you; "[muxtower message from …]"
  is a teammate (or a device) writing to you, not the owner. Relaying the owner's words? Say so in the text.
- Another project's session: send_task to role@project, or to its id; list_sessions shows each session's
  role and project.
- Writing to a teammate: send_task by default (work, reports, anything long: it waits while they are on a
  prompt, and is kept on record). send_message types in at once: only to answer the prompt they are stopped
  on, send a slash command, or pass on the owner's words; it can cut in or be taken as their answer.
- Only this machine shown, or a machine missing? This machine's link to its hub may be down for a moment
  (the tools say so with a NOTE): try again shortly. Never conclude another machine has no muxtower.
- "also writing in <worktree>" means another session changes files in your checkout: agree with it
  (send_task) or ask the owner. If no file is changed by both, go on, but commit only your own changes."""


class TeamArgs(BaseModel):
    pass


class RoleArgs(BaseModel):
    role: str | None = Field(description="what the session is for, in a few words (empty: no role)")
    note: str | None = Field(default=None, description="one more line about it, optional")
    session_id: str | None = Field(default=None, description="whose role; default: yours")


class TaskArgs(BaseModel):
    to: str = Field(
        min_length=1,
        description="a session id; a role in your project (when one session has it); or role@project for another "
        "project (split at the last @)",
    )
    text: str = Field(min_length=1, max_length=20000, description="the work, as you would ask a colleague")


class ProjectArgs(BaseModel):
    project: str = Field(min_length=1, description="the project's name; a new name makes a new project")
    session_id: str | None = Field(default=None, description="which session; default: yours")
    rename: bool = Field(default=False, description="rename its project, for every session in it, instead")


def _who(m: Member) -> str:
    s = m.session
    role = f"role: {m.role}" + (f" — {m.note}" if m.note else "") if m.role else "no role yet"
    where = f"in {s.cwd}" if s.cwd else "folder unknown"
    if m.checkout and m.checkout.root:
        where += f" · worktree {m.checkout.root}" + (f" on {m.checkout.branch}" if m.checkout.branch else "")
    state = s.state.value + (" · NEEDS THE OWNER" if s.needs_attention else "")
    return f"{s.id} · {s.name} · {role} · @{device(s)} · {state} · {where}"


def _writing(m: Member) -> list[str]:
    """Who else wrote in the worktree it writes in, lately (`writes/`): one line per worktree."""
    by_tree: dict[str, list[str]] = defaultdict(list)
    files: dict[str, set[str]] = defaultdict(set)
    for w in m.session.also_writing:
        by_tree[w.worktree].append(f"{w.name} ({w.session_id})")
        files[w.worktree] |= set(w.files)
    return [
        f"  also writing in {tree}: {', '.join(names)}"
        + (f" · both changed {', '.join(sorted(files[tree])[:10])}" if files[tree] else "")
        for tree, names in by_tree.items()
    ]


def _project(m: Member) -> str:
    return m.project + ("" if m.project_source == "set" else f" (from its {m.project_source})")


def _tasks(tasks: list[Task]) -> str:
    def one(t: Task) -> str:
        head = " ".join(t.text.split())
        head = head if len(head) <= 60 else head[:59] + "…"
        return f"{t.at.astimezone():%m-%d %H:%M} from {t.from_label.split(' · ')[0]}: {head} ({t.status})"

    return "  recent tasks: " + "; ".join(one(t) for t in tasks)


# A team tool asked of the hub this daemon is a node of: its text, None when it is no node (raises
# Unavailable when the hub cannot answer now).
Forward = Callable[[str, dict[str, Any], str | None], str | None]


READS = frozenset({"my_team"})  # what this machine may answer itself while its hub is away


class TeamTools:
    def __init__(self, teams: TeamService, tasks: TaskService | None = None, forward: Forward | None = None) -> None:
        self.teams = teams
        self.tasks = tasks
        self.forward = forward
        # Each machine with the folder a session starts in there when given none (start_session without cwd).
        self.machines: Callable[[], list[tuple[str, str | None]]] = list

    def _via_hub(self, name: str, here: Callable[[Any], str]) -> Callable[[Any], str]:
        """On a node, the hub answers (it sees every session); without it, this machine does, and says so."""

        def run(args: BaseModel) -> str:
            if self.forward is None:
                return here(args)
            try:
                answered = self.forward(name, args.model_dump(), CALLER.get().session_id)
            except Unavailable as exc:
                if name not in READS:  # the hub keeps team data: written here, the two would part ways
                    raise Unavailable(
                        f"the hub is unreachable now ({exc}): try again when it is back; nothing was changed"
                    ) from exc
                return f"NOTE: {exc}. Only this machine's sessions below.\n{here(args)}"
            return here(args) if answered is None else answered

        return run

    def tools(self) -> list[Tool]:
        found = [
            Tool("my_team", "Who you are (your session, role and project) and who works with you: each session "
                 "of your project with its role, device, state, folder, branch and the tasks it was sent last. "
                 "Call it first.", TeamArgs, self.my_team),
            Tool("set_role", "Set what a session is for (free text, a few words, plus an optional note): yours, "
                 "or a teammate's by session_id. An empty role clears it.", RoleArgs, self.set_role),
            Tool("set_project", "Move a session (yours by default) to a project, a new name making a new one; "
                 "or, with rename, rename its project for all its sessions.", ProjectArgs, self.set_project),
        ]  # fmt: skip
        if self.tasks is not None:
            found.append(
                Tool("send_task", "Use this by default to write to a teammate: work for it, results to report back, "
                     "anything long. `to` is a role in your project, role@project for another one, or a session id "
                     "(list_sessions shows who is in which project). It "
                     "arrives headed [muxtower task from <you>]; while it waits on a prompt the task is queued "
                     "and goes out once that is answered, and every task is kept on record.", TaskArgs,
                     self.send_task)
            )  # fmt: skip
        return [Tool(t.name, t.description, t.args, self._via_hub(t.name, t.run)) for t in found]

    def _target(self, session_id: str | None) -> str:
        target = session_id or CALLER.get().session_id
        if target is None:
            raise Invalid("whose? muxtower cannot tell which session you are: pass session_id")
        return target

    def my_team(self, _: TeamArgs) -> str:
        members = self.teams.members()
        me = CALLER.get().session_id
        mine = next((m for m in members if m.session.id == me), None)
        if mine is None:
            projects: dict[str, list[Member]] = defaultdict(list)
            for m in members:
                projects[m.project].append(m)
            out = [UNKNOWN_CALLER]
            for name, team in sorted(projects.items()):
                out += [f"Project {name}:", *(f"- {_who(m)}" for m in team)]
            return "\n".join(out)
        others = [m for m in members if m.project == mine.project and m.session.id != me]
        recent = self.tasks.recent([m.session.id for m in [mine, *others]]) if self.tasks else {}
        out = [f"You: {_who(mine)} · project {_project(mine)}", *_writing(mine)]
        if mine.session.id in recent:
            out.append(_tasks(recent[mine.session.id]))
        if not mine.role:
            out.append("You have no role yet: ask the owner what you are for, or set it (set_role).")
        out.append(f"Your team ({len(others)} other session{'s' if len(others) != 1 else ''} in {mine.project}):")
        for m in others:
            out.append(f"- {_who(m)}")
            out += _writing(m)
            if m.session.id in recent:
                out.append(_tasks(recent[m.session.id]))
        if not others:
            out.append("- nobody else yet")
        if machines := self.machines():
            folders = " · ".join(f"@{name} {folder or '(not known yet)'}" for name, folder in machines)
            out.append(f"Machines, with the folder start_session uses when given no cwd: {folders}")
        return "\n".join(out)

    def send_task(self, args: TaskArgs) -> str:
        assert self.tasks is not None
        caller = CALLER.get()
        _, to, outcome = self.tasks.send(caller.session_id, caller.actor, args.to, args.text)
        who = f"{to.session.name} ({to.role or 'no role'}, {to.session.id})"
        if outcome == "delivered":
            return f"Delivered to {who}: it takes it up when it can (Claude Code queues it behind what it is doing)."
        if outcome == "waiting":
            return f"{who} is waiting on the owner (a prompt): it gets the task as soon as that is answered."
        if outcome == "undeliverable":
            return f"Not delivered: {who} is gone."
        return f"Queued for {who}: it goes out in order, behind any earlier task to it, as soon as it can."

    def set_role(self, args: RoleArgs) -> str:
        m = self.teams.set_role(self._target(args.session_id), args.role, args.note)
        return f"{m.session.name} ({m.session.id}): " + (f"role {m.role}." if m.role else "no role now.")

    def set_project(self, args: ProjectArgs) -> str:
        m, moved = self.teams.set_project(self._target(args.session_id), args.project, args.rename)
        if args.rename:
            return f"Project renamed to {m.project} for {moved} session{'s' if moved != 1 else ''}."
        return f"{m.session.name} ({m.session.id}) is in project {m.project} now."
