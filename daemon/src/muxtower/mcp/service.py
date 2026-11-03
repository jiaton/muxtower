"""The tools muxtower offers over MCP: what an agent (the concierge, or any MCP client with a device
token) needs to look after the owner's other sessions. Output is plain text, short enough to relay."""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field

from muxtower.concierge.service import ConciergeService
from muxtower.errors import Conflict, Invalid, Unavailable
from muxtower.mcp.describe import line
from muxtower.mcp.team_tools import ProjectArgs, RoleArgs, TeamArgs, TeamTools
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.launcher import Launcher
from muxtower.sessions.models import ConversationItemKind, CreateSession, ItemStatus, Session
from muxtower.teams.service import TeamService
from muxtower.terminal.models import SendInput

REPLY_CHARS = 20000  # a reply is relayed whole, within reason
ITEM_CHARS = 1000
SCREEN_LINES = 60
ALL_ITEMS = 10000


class NoArgs(BaseModel):
    pass


class ListArgs(BaseModel):
    all: bool = Field(default=False, description="also archived and hidden sessions")


class SessionArg(BaseModel):
    session_id: str = Field(description="from list_sessions")


class ReadArgs(SessionArg):
    items: int = Field(default=20, ge=1, le=100, description="how many recent conversation items")
    after: int | None = Field(
        default=None, ge=0, description="only the conversation items after this one (as a [muxtower event] names)"
    )


class EventsArgs(BaseModel):
    after: int = Field(default=0, ge=0, description="the last event number you saw; 0 for all that are kept")


class MessageArgs(SessionArg):
    text: str = Field(min_length=1, max_length=20000, description="sent as the owner's message to that session")


class ApproveArgs(SessionArg):
    option: str | None = Field(default=None, description="option key from read_session; default: the usual yes")
    answers: list[list[str]] | None = Field(
        default=None, description="for a QUESTIONS prompt: the option labels picked for each question, in order"
    )


class StartArgs(BaseModel):
    cwd: str = Field(description="directory to work in, on the machine it starts on")
    prompt: str | None = Field(default=None, description="first message for the new agent")
    name: str | None = None
    runtime: str = Field(default="claude-code", description="claude-code, codex, …")
    machine: str | None = Field(
        default=None, description="the device to start it on, as list_sessions names it (@name); default: the hub"
    )


@dataclass
class Tool:
    name: str
    description: str
    args: type[BaseModel]
    run: Callable[[Any], str]

    def schema(self) -> dict[str, Any]:
        return {"name": self.name, "description": self.description, "inputSchema": self.args.model_json_schema()}


def _clip(text: str, chars: int) -> str:
    return text if len(text) <= chars else f"{text[:chars]}… ({len(text) - chars} more characters)"


class McpTools:
    def __init__(
        self, directory: SessionDirectory, launcher: Launcher, concierge: ConciergeService | None, hub: str,
        machines: Callable[[], list[str]] = list, teams: TeamService | None = None,
    ) -> None:  # fmt: skip
        self.directory = directory
        self.launcher = launcher
        self.machines = machines  # the names of the nodes joined to this hub
        self.concierge = concierge
        self.hub = hub
        tools = [
            Tool("list_sessions", "Every agent session the owner has, one per line: id · name · @device it runs "
                 "on (or unknown device) · agent harness · what reaches it (muxtower on a device, through tmux or "
                 "headless, or only the Claude account's Remote Control) · folder · state · one-line summary.",
                 ListArgs, self.list_sessions),
            Tool("read_session", "A session's pending prompt (with option keys), the next step it offers (replies "
                 "to pick, sent with send_message), latest reply and recent conversation (or its terminal screen).",
                 ReadArgs, self.read_session),
            Tool("send_message", "Send a message to a session, as the owner.", MessageArgs, self.send_message),
            Tool("approve", "Answer a session's pending permission prompt or question with an option.",
                 ApproveArgs, self.approve),
            Tool("deny", "Decline a session's pending prompt.", SessionArg, self.deny),
            Tool("interrupt", "Stop what a session is doing (Escape).", SessionArg, self.interrupt),
            Tool("start_session", "Start a new agent session in tmux, on the hub or on another device joined "
                 "to it (machine).", StartArgs, self.start_session),
        ]  # fmt: skip
        if concierge is not None:
            tools += [
                Tool("watch_session", "Be told (a [muxtower event #N · time] line with its id, state and where its "
                     "new items start) when this session finishes a turn or needs the owner.",
                     SessionArg, self.watch),
                Tool("unwatch_session", "Stop being told about this session.", SessionArg, self.unwatch),
                Tool("list_events", "The [muxtower event] lines muxtower recorded after an event number (it "
                     "keeps the latest few hundred), to catch up after a restart or when one may be missed.",
                     EventsArgs, self.list_events),
            ]  # fmt: skip
        if teams is not None:
            team = TeamTools(teams)
            tools += [
                Tool("my_team", "Who you are (your session, role and project) and who works with you: each "
                     "session of your project with its role, device, state, folder and branch. Call it first.",
                     TeamArgs, team.my_team),
                Tool("set_role", "Set what a session is for (free text, a few words, plus an optional note): "
                     "yours, or a teammate's by session_id. An empty role clears it.", RoleArgs, team.set_role),
                Tool("set_project", "Move a session (yours by default) to a project, a new name making a new "
                     "one; or, with rename, rename its project for all its sessions.", ProjectArgs, team.set_project),
            ]  # fmt: skip
        self.tools = {t.name: t for t in tools}

    def _target(self, session_id: str) -> Session:
        session = self.directory.get(session_id)
        if self.concierge and session.id == self.concierge.session_id:
            raise Invalid("that is the concierge itself")
        return session

    def list_sessions(self, args: ListArgs) -> str:
        concierge = self.concierge.session_id if self.concierge else None
        sessions = [
            s for s in self.directory.list() if s.id != concierge and (args.all or not (s.archived_at or s.hidden))
        ]  # fmt: skip
        sessions.sort(key=lambda s: (not s.needs_attention, -s.updated_at.timestamp()))
        return "\n".join(line(s, self.hub) for s in sessions) or "No sessions."

    def read_session(self, args: ReadArgs) -> str:
        s = self._target(args.session_id)
        out = [line(s, self.hub)]
        if s.needs_attention and s.pending:
            options = ", ".join(f"{o.key}={o.label}" for o in s.pending.options) or "-"
            out.append(f"PENDING {s.pending.tool_name or s.state.value}: {s.pending.detail or ''} | options: {options}")
            for n, q in enumerate(s.pending.questions, 1):
                kind = "pick any" if q.multi_select else "pick one"
                out.append(f"QUESTION {n} ({kind}): {q.question} | {', '.join(o.label for o in q.options)}")
            if len(s.pending.questions) > 1 or any(q.multi_select for q in s.pending.questions):
                out.append("Answer every question at once: approve with answers=[[labels of 1], [labels of 2], …]")
        if s.summary and (s.summary.needs or s.summary.recent):
            out.append(f"Turn summary: {s.summary.needs or ''} {s.summary.recent or ''}".strip())
        if s.capabilities.conversation:
            if args.after == 0:  # from the start: the conversation API answers after=0 with the latest items
                page = self.directory.conversation(s.id, 0, ALL_ITEMS)
                page.items = page.items[: args.items]
            else:
                page = self.directory.conversation(s.id, args.after or 0, args.items)
            items = page.items
            step = next((i for i in reversed(items) if i.kind == ConversationItemKind.NEXT_STEP), None)
            if step and step.status == ItemStatus.PENDING and step.actions:
                replies = "; ".join(f"{a.label} = send_message {a.message!r}" for a in step.actions)
                out.append(f"NEXT STEP it offers: {step.ask or ''} | replies: {replies}")
            if args.after is None:
                out.append("Recent conversation:")
            else:
                out.append(
                    f"Conversation after item {args.after}:" if items else f"Nothing new after item {args.after}."
                )
            out += [f"#{i.seq} [{i.kind.value}{'/' + i.status.value if i.status else ''}] "
                    f"{(i.tool_name + ' ') if i.tool_name else ''}{_clip(i.text or '', ITEM_CHARS)}"
                    for i in items]  # fmt: skip
            if args.after is not None and items and page.latest_seq > items[-1].seq:
                out.append(f'More: read_session(session_id="{s.id}", after={items[-1].seq})')
        elif s.capabilities.screen:
            lines = self.directory.screen(s.id, 0).text.rstrip().splitlines()
            out.append("Screen (no conversation items to page through):" if args.after is not None else "Screen:")
            out += lines[-SCREEN_LINES:]
        if s.last_message:
            out.append(f"Latest reply: {_clip(s.last_message, REPLY_CHARS)}")
        return "\n".join(out)

    def send_message(self, args: MessageArgs) -> str:
        s = self._target(args.session_id)
        self.directory.send_input(s.id, SendInput(text=args.text, enter=True))
        return f"Sent to {s.name}."

    def approve(self, args: ApproveArgs) -> str:
        s = self._target(args.session_id)
        result = self.directory.approve(s.id, args.option, args.answers)
        return f"{s.name}: answered {result.option or 'the default'}."

    def deny(self, args: SessionArg) -> str:
        s = self._target(args.session_id)
        self.directory.deny(s.id)
        return f"{s.name}: declined."

    def interrupt(self, args: SessionArg) -> str:
        s = self._target(args.session_id)
        self.directory.send_input(s.id, SendInput(key="Escape"))
        return f"{s.name}: interrupted."

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
        request = CreateSession(
            runtime=args.runtime, cwd=args.cwd, name=args.name, args=[args.prompt] if args.prompt else [], node=node
        )
        try:
            created = self.launcher.create(request)
        except (Conflict, Unavailable) as exc:
            if node is None:
                raise
            raise type(exc)(f"could not start it on {node}: {exc}") from exc
        return f"Started {created.name} ({created.id}) on {node or self.hub} in {created.cwd}."

    def watch(self, args: SessionArg) -> str:
        assert self.concierge is not None
        s = self.concierge.watch(args.session_id)
        return f"Watching {s.name}."

    def unwatch(self, args: SessionArg) -> str:
        assert self.concierge is not None
        self.concierge.unwatch(args.session_id)
        return "Stopped watching."

    def list_events(self, args: EventsArgs) -> str:
        assert self.concierge is not None
        events = self.concierge.recorded(args.after)
        if not events:
            return f"No events after #{args.after}."
        out = [e.line + ("" if e.delivered else " (not sent to you yet)") for e in events]
        if len(events) == 50:
            out.append(f"More: list_events(after={events[-1].number})")
        return "\n".join(out)
