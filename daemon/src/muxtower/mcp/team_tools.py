"""The MCP tools for teams: who the calling session is and who works with it (`my_team`), and setting a
session's role and project. A session is told apart by its own token (`caller.py`); a device's call is
answered for all projects, since it is no session."""

from collections import defaultdict

from pydantic import BaseModel, Field

from muxtower.errors import Invalid
from muxtower.mcp.caller import CALLER
from muxtower.mcp.describe import device
from muxtower.teams.service import Member, TeamService

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
- Wrong project? Move a session with set_project, or rename yours for all its sessions (rename=true).
- Messages that start with "[muxtower task from …]" are work a teammate sent you."""


class TeamArgs(BaseModel):
    pass


class RoleArgs(BaseModel):
    role: str | None = Field(description="what the session is for, in a few words (empty: no role)")
    note: str | None = Field(default=None, description="one more line about it, optional")
    session_id: str | None = Field(default=None, description="whose role; default: yours")


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


def _project(m: Member) -> str:
    return m.project + ("" if m.project_source == "set" else f" (from its {m.project_source})")


class TeamTools:
    def __init__(self, teams: TeamService) -> None:
        self.teams = teams

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
        out = [f"You: {_who(mine)} · project {_project(mine)}"]
        if not mine.role:
            out.append("You have no role yet: ask the owner what you are for, or set it (set_role).")
        out.append(f"Your team ({len(others)} other session{'s' if len(others) != 1 else ''} in {mine.project}):")
        out += [f"- {_who(m)}" for m in others] or ["- nobody else yet"]
        return "\n".join(out)

    def set_role(self, args: RoleArgs) -> str:
        m = self.teams.set_role(self._target(args.session_id), args.role, args.note)
        return f"{m.session.name} ({m.session.id}): " + (f"role {m.role}." if m.role else "no role now.")

    def set_project(self, args: ProjectArgs) -> str:
        m, moved = self.teams.set_project(self._target(args.session_id), args.project, args.rename)
        if args.rename:
            return f"Project renamed to {m.project} for {moved} session{'s' if moved != 1 else ''}."
        return f"{m.session.name} ({m.session.id}) is in project {m.project} now."
