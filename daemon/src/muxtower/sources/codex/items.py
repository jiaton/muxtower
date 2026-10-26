"""A Codex thread's items (app-server protocol v2) as conversation items.

The app-server sends each item as it starts and again when it completes (`item/started`,
`item/completed`, and `thread/read` with its turns); an item keeps its seq across both. Reasoning is not
shown; a turn's end is a result. Approval and question prompts are the server's requests, not items:
the source adds them (`prompt`, `resolve`).
"""

from typing import Any

from muxtower.agent_text import truncate
from muxtower.sessions.models import ConversationItem, ConversationItemKind, ItemStatus

MAX_ITEMS = 2000
TOOL_STATUS = {
    "inProgress": ItemStatus.RUNNING,
    "completed": ItemStatus.DONE,
    "failed": ItemStatus.ERROR,
    "declined": ItemStatus.ERROR,
}


def _text(content: Any) -> str:
    if not isinstance(content, list):
        return ""
    return "\n".join(
        str(c.get("text") or "") for c in content if isinstance(c, dict) and c.get("type") == "text"
    ).strip()


def tool_of(item: dict[str, Any]) -> tuple[str, str | None] | None:
    """The tool an item ran and the one line that says what it did; None for items that are no tool."""
    kind = item.get("type")
    if kind == "commandExecution":
        return "exec_command", truncate(str(item.get("command") or "")) or None
    if kind == "fileChange":
        paths = [str(c.get("path")) for c in item.get("changes") or [] if isinstance(c, dict) and c.get("path")]
        return "apply_patch", truncate("\n".join(paths)) or None
    if kind == "mcpToolCall":
        return f"mcp__{item.get('server')}__{item.get('tool')}", None
    if kind == "webSearch":
        return "web_search", str(item.get("query") or "") or None
    if kind == "dynamicToolCall":
        return str(item.get("tool") or item.get("name") or "tool"), None
    return None


class ThreadItems:
    """One thread's conversation, built from its items as they come."""

    def __init__(self) -> None:
        self.items: dict[int, ConversationItem] = {}
        self._seqs: dict[str, int] = {}  # item or request id → seq
        self._next = 0

    def _seq(self, key: str) -> int:
        if key not in self._seqs:
            self._next += 1
            self._seqs[key] = self._next
        return self._seqs[key]

    def _put(self, item: ConversationItem) -> ConversationItem:
        self.items[item.seq] = item
        for seq in sorted(self.items)[:-MAX_ITEMS]:
            del self.items[seq]
        return item

    @property
    def last_reply(self) -> str | None:
        for seq in sorted(self.items, reverse=True):
            if self.items[seq].kind == ConversationItemKind.REPLY:
                return self.items[seq].text
        return None

    def after(self, seq: int, limit: int) -> list[ConversationItem]:
        newer = [self.items[s] for s in sorted(self.items) if s > seq]
        return newer[-limit:] if seq == 0 else newer[:limit]

    def item(self, item: dict[str, Any], completed: bool) -> ConversationItem | None:
        """An item started or completed; None when it is not shown (reasoning, an empty start)."""
        kind, key = item.get("type"), str(item.get("id") or "")
        if kind == "userMessage" and (text := _text(item.get("content"))):
            return self._put(ConversationItem(seq=self._seq(key), kind=ConversationItemKind.PROMPT, text=text))
        if kind == "agentMessage" and (text := str(item.get("text") or "").strip()):
            return self._put(ConversationItem(seq=self._seq(key), kind=ConversationItemKind.REPLY, text=text))
        tool = tool_of(item)
        if tool is None:
            return None
        status = TOOL_STATUS.get(str(item.get("status")), ItemStatus.DONE if completed else ItemStatus.RUNNING)
        if kind == "commandExecution" and item.get("exitCode") not in (0, None):
            status = ItemStatus.ERROR
        name, what = tool
        seq = self._seq(key)
        return self._put(
            ConversationItem(seq=seq, kind=ConversationItemKind.TOOL, tool_name=name, text=what, status=status)
        )

    def turn_ended(self, turn: dict[str, Any]) -> ConversationItem:
        status = turn.get("status")
        error = turn.get("error") if isinstance(turn.get("error"), dict) else None
        text = (error or {}).get("message") or (status if status not in ("completed", None) else None)
        done = ItemStatus.DONE if status == "completed" else ItemStatus.ERROR
        seq = self._seq(f"turn:{turn.get('id')}")
        return self._put(ConversationItem(seq=seq, kind=ConversationItemKind.RESULT, text=text, status=done))

    def prompt(
        self, request_id: str, kind: ConversationItemKind, text: str | None, tool_name: str | None
    ) -> ConversationItem:
        """A server request waiting for the owner: an approval or a question."""
        seq = self._seq(f"request:{request_id}")
        return self._put(
            ConversationItem(seq=seq, kind=kind, text=text, tool_name=tool_name, status=ItemStatus.PENDING)
        )

    def resolve(self, request_id: str, status: ItemStatus) -> ConversationItem | None:
        seq = self._seqs.get(f"request:{request_id}")
        item = self.items.get(seq) if seq is not None else None
        return (
            self._put(item.model_copy(update={"status": status}))
            if item and item.status == ItemStatus.PENDING
            else None
        )
