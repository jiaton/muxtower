"""The Inbox's MCP tools: listed to the concierge alone (`McpTools.listed`), so no other session's tool list,
and so its context, grows by a byte. They act on the hub's Inbox (the concierge runs on the hub; a node lists
them to no one)."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from muxtower.chips.service import MAX_PROJECT_NAME
from muxtower.errors import Conflict
from muxtower.inbox.models import TEXT_CHARS, HandTarget, InboxStatus, NewInboxItem, OnDue
from muxtower.inbox.service import InboxService
from muxtower.inbox.text import line, render
from muxtower.mcp.caller import CALLER
from muxtower.mcp.tool import Tool


class ReadInboxArgs(BaseModel):
    done: bool = Field(default=False, description="also the items done in the last 30 days")


class DueArgs(BaseModel):
    due: datetime | None = Field(
        default=None,
        description="when it falls due: the owner's local time (YYYY-MM-DDTHH:MM), or a date alone with "
        "due_has_time false (then at the owner's due hour); null clears it",
    )
    due_has_time: bool | None = None
    on_due: OnDue | None = Field(
        default=None, description="remind (a push to the owner; default) or hand_off (the hub hands it then)"
    )
    due_target: HandTarget | None = Field(default=None, description="for hand_off: {project, role or session_id}")


class AddArgs(DueArgs):
    text: str = Field(min_length=1, max_length=TEXT_CHARS, description="the idea, in the owner's words")
    project: str | None = Field(default=None, max_length=MAX_PROJECT_NAME, description="the project it is about")


class ItemArgs(BaseModel):
    id: int = Field(description="the item's id, from read_inbox")
    if_version: int = Field(description="its version as you read it: refused if the owner changed it since")


class UpdateArgs(ItemArgs, DueArgs):
    text: str | None = Field(default=None, min_length=1, max_length=TEXT_CHARS)
    project: str | None = Field(default=None, max_length=MAX_PROJECT_NAME, description="null: no project")


class HandArgs(BaseModel):
    id: int
    project: str = Field(min_length=1, max_length=MAX_PROJECT_NAME)
    role: str | None = Field(default=None, description="a role in the project: whoever holds it")
    session_id: str | None = Field(default=None, description="or a session, by id")


class InboxTools:
    def __init__(self, inbox: InboxService) -> None:
        self.inbox = inbox

    def tools(self) -> list[Tool]:
        return [
            Tool("read_inbox", "The owner's Inbox of ideas across projects, one line each: #id, version, status, "
                 "project, due date, text.", ReadInboxArgs, self.read),
            Tool("add_inbox_item", "Note one of the owner's ideas in their Inbox, e.g. when they say \"note this\" "
                 "/ \"记一下…\" (in Live or to you). Optional: its project, a due date, and what the hub does then "
                 "(remind them, or hand it off).", AddArgs, self.add),
            Tool("update_inbox_item", "Change an item's text, project or due date. Give the version you read: if "
                 "the owner changed it since, nothing is changed and you get it as it is now.", UpdateArgs,
                 self.update),
            Tool("close_inbox_item", "Mark an item done (it leaves the list), e.g. once its task was reported "
                 "done.", ItemArgs, self.close),
            Tool("hand_inbox_item", "Only when the owner asks you to: send an item as one task to a role in a "
                 "project (whoever holds it) or to a session.", HandArgs, self.hand),
        ]  # fmt: skip

    def read(self, args: ReadInboxArgs) -> str:
        found = self.inbox.inbox(args.done)
        out = render(found.items) or "The Inbox is empty."
        if args.done:
            out += "\nDone:\n" + (render(found.done) or "none")
        return out

    def add(self, args: AddArgs) -> str:
        new = NewInboxItem.model_validate(args.model_dump(exclude_unset=True))
        return "Added " + line(self.inbox.add(new, CALLER.get().actor))

    def _patch(self, args: ItemArgs, body: dict[str, Any]) -> str:
        item, changed = self.inbox.patch(args.id, {**body, "if_version": args.if_version}, CALLER.get().actor)
        if not changed:
            raise Conflict(f"Not changed: #{args.id} changed since v{args.if_version}. Now: {line(item)}")
        return "Now " + line(item)

    def update(self, args: UpdateArgs) -> str:
        return self._patch(args, args.model_dump(exclude_unset=True, exclude={"id", "if_version"}))

    def close(self, args: ItemArgs) -> str:
        return self._patch(args, {"status": InboxStatus.DONE})

    def hand(self, args: HandArgs) -> str:
        target = HandTarget(project=args.project, role=args.role, session_id=args.session_id)
        item = self.inbox.hand(args.id, target, CALLER.get().actor)
        return "Handed " + line(item)
