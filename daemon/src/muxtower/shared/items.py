"""A `share_file` call in a conversation, turned into a `shared` item at its own place (its `seq`): its
result names the file in a line of its own (`MARKER` + the `SharedFile` as JSON), so any source whose
transcript keeps the call and its result (Claude Code, Remote Control, Codex) shows it, archived too.

What the line says is trusted no further than the conversation it is in: the file is served only from the
session's own store, by id, so a made-up line shows an item whose file is not found."""

import json

from pydantic import ValidationError

from muxtower.sessions.models import ConversationItem, ConversationItemKind, ItemStatus
from muxtower.shared.models import SHARE_TOOL, SharedFile

MARKER = "muxtower-shared: "


def _size(n: int) -> str:
    if n < 1024:
        return f"{n} bytes"
    return f"{n / 1024:.1f} KB" if n < 1024 * 1024 else f"{n / (1024 * 1024):.1f} MB"


def share_result(shared: SharedFile) -> str:
    """What `share_file` answers the agent: in words, then the line the conversation reads it from."""
    until = shared.expires_at.strftime("%Y-%m-%d")
    return (
        f"Shared {shared.name} ({_size(shared.size)}) with the owner: it shows in your conversation in muxtower, "
        f"kept until {until}.\n{MARKER}{shared.model_dump_json()}"
    )


def is_share_tool(tool_name: str | None) -> bool:
    """muxtower's own `share_file`, as an agent names it (`mcp__muxtower__share_file`, or bare)."""
    name = tool_name or ""
    return name == SHARE_TOOL or name.endswith(f"__{SHARE_TOOL}") and "muxtower" in name


def as_shared(item: ConversationItem, output: str) -> ConversationItem | None:
    """The `shared` item a finished `share_file` call becomes, or None (another tool, or a call that failed)."""
    if not is_share_tool(item.tool_name):
        return None
    for line in _lines(output):
        if line.startswith(MARKER):
            try:
                shared = SharedFile.model_validate_json(line[len(MARKER) :])
            except ValidationError:
                return None
            return item.model_copy(
                update={
                    "kind": ConversationItemKind.SHARED, "shared": shared, "text": shared.caption,
                    "status": ItemStatus.DONE, "images": [], "description": None,
                }
            )  # fmt: skip
    return None


def _lines(output: str) -> list[str]:
    """Its lines, and those of the texts inside it when it is JSON (Codex may keep an MCP result as such)."""
    lines = output.splitlines()
    if output.lstrip()[:1] in ("[", "{"):
        try:
            lines += [line for text in _texts(json.loads(output)) for line in text.splitlines()]
        except ValueError:
            pass
    return lines


def _texts(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [t for v in value for t in _texts(v)]
    if isinstance(value, dict):
        return [t for v in value.values() for t in _texts(v)]
    return []


def output_text(content: object) -> str:
    """A tool result's text: a string, or the text blocks of a list (Claude Code, MCP)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(str(b.get("text") or "") for b in content if isinstance(b, dict) and b.get("type") == "text")
    return ""
