"""The Claude desktop app's next-step box: at the end of a turn the agent calls a tool the app provides
(`wrap_up`) with a recap, a question and replies to pick, and the app shows them as a box with buttons.
Here it becomes a `next_step` item, so muxtower offers the same replies (`claude_conversation.py`)."""

from datetime import datetime
from typing import Any

from muxtower.sessions.models import ConversationItem, ConversationItemKind, ItemStatus, NextStepAction

WRAP_UP_TOOLS = {"mcp__ccd_turn__wrap_up"}


def next_step(block: dict[str, Any], seq: int, at: datetime | None) -> ConversationItem | None:
    """A `wrap_up` tool call as an item; None for any other block."""
    if block.get("type") != "tool_use" or block.get("name") not in WRAP_UP_TOOLS:
        return None
    given = block.get("input")
    given = given if isinstance(given, dict) else {}
    raw = given.get("actions")
    actions = [
        NextStepAction(label=str(a["label"]), message=str(a.get("message") or a["label"]))
        for a in (raw if isinstance(raw, list) else [])
        if isinstance(a, dict) and a.get("label")
    ]
    recap, ask = given.get("recap"), given.get("ask")
    return ConversationItem(
        seq=seq, at=at, kind=ConversationItemKind.NEXT_STEP, text=str(recap) if recap else None,
        ask=str(ask) if ask else None, actions=actions, status=ItemStatus.PENDING,
    )  # fmt: skip
