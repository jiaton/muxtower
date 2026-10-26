"""A Codex session's conversation, read from its rollout file.

Codex writes each session to `~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<thread id>.jsonl`: one
`{timestamp, type, payload}` per line. What the owner and the agent said are `event_msg`s
(`user_message`, `agent_message`); tool calls are `response_item`s (`function_call`, `custom_tool_call`,
`local_shell_call`, `web_search_call`) whose output arrives later under the same `call_id`; a turn ends
with `task_complete` (or `turn_complete`, `turn_aborted`). Approval prompts are never written down, so
the file cannot tell a waiting turn from a working one: the screen does.

In "code mode" a tool call is a script (`custom_tool_call` named `exec`) that calls the real tools, as
`tools.exec_command({"cmd": …})`: the first one it calls names the call.
"""

import json
import re
from datetime import datetime
from typing import Any

from muxtower.agent_text import describe_tool_input, truncate
from muxtower.sessions.models import ConversationItem, ConversationItemKind, ItemStatus

MAX_ITEMS = 2000
TOOL_CALLS = {"function_call", "custom_tool_call", "local_shell_call", "web_search_call"}
TOOL_OUTPUTS = {"function_call_output", "custom_tool_call_output", "local_shell_call_output"}
TURN_ENDS = {"task_complete", "turn_complete"}
ABORTED = {"turn_aborted", "task_aborted"}
SCRIPT_CALL = re.compile(r"tools\.(\w+)\(\s*(\{.*?\})\s*\)", re.S)
FAILED = re.compile(r"^(Script failed|Process exited with code [1-9])|Exit code: [1-9]", re.M)


def _at(value: Any) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")) if value else None
    except ValueError:
        return None


def _json(text: Any) -> Any:
    try:
        return json.loads(text) if isinstance(text, str) else text
    except ValueError:
        return None


def _output_text(output: Any) -> str:
    if isinstance(output, list):
        return "\n".join(str(o.get("text") or "") for o in output if isinstance(o, dict))
    return str(output or "")


def tool_of(payload: dict[str, Any]) -> tuple[str, str | None]:
    """The tool a call runs and the one line that says what it does."""
    kind = payload.get("type")
    if kind == "local_shell_call":
        command = (payload.get("action") or {}).get("command")
        return "exec_command", " ".join(command) if isinstance(command, list) else None
    if kind == "web_search_call":
        query = (payload.get("action") or {}).get("query")
        return "web_search", str(query) if query else None
    name = str(payload.get("name") or "tool")
    if kind == "custom_tool_call" and name == "exec":  # code mode: a script calling tools
        script = str(payload.get("input") or "")
        found = SCRIPT_CALL.search(script)
        if found:
            args = _json(found.group(2))
            return found.group(1), describe_tool_input(args) if isinstance(args, dict) else truncate(found.group(2))
        return "exec", truncate(script) or None
    args = _json(payload.get("arguments")) if kind == "function_call" else payload.get("input")
    if isinstance(args, dict):
        return name, describe_tool_input(args)
    return name, truncate(str(args)) if args else None


class RolloutBuilder:
    """Rollout lines → conversation items, in the order written; a tool call's item is sent again once
    its output tells how it ended."""

    def __init__(self) -> None:
        self.items: dict[int, ConversationItem] = {}
        self._calls: dict[str, int] = {}  # call_id → its item's seq
        self._seq = 0

    @property
    def last_reply(self) -> str | None:
        for seq in sorted(self.items, reverse=True):
            if self.items[seq].kind == ConversationItemKind.REPLY:
                return self.items[seq].text
        return None

    def after(self, seq: int, limit: int) -> list[ConversationItem]:
        newer = [self.items[s] for s in sorted(self.items) if s > seq]
        return newer[-limit:] if seq == 0 else newer[:limit]

    def feed_lines(self, lines: list[bytes]) -> list[ConversationItem]:
        touched: dict[int, ConversationItem] = {}
        for line in lines:
            self._seq += 1
            try:
                record = json.loads(line)
            except ValueError:
                continue
            if isinstance(record, dict) and isinstance(record.get("payload"), dict):
                for item in self._apply(str(record.get("type")), record["payload"], _at(record.get("timestamp"))):
                    self.items[item.seq] = item
                    touched[item.seq] = item
        for seq in sorted(self.items)[:-MAX_ITEMS]:
            del self.items[seq]
        return [touched[s] for s in sorted(touched)]

    def _item(self, kind: ConversationItemKind, at: datetime | None, **fields: Any) -> ConversationItem:
        return ConversationItem(seq=self._seq, at=at, kind=kind, **fields)

    def _finish(self, call_id: Any, status: ItemStatus) -> list[ConversationItem]:
        seq = self._calls.get(str(call_id))
        item = self.items.get(seq) if seq is not None else None
        if item is None or item.status == ItemStatus.ERROR:
            return []
        return [item.model_copy(update={"status": status})]

    def _apply(self, kind: str, payload: dict[str, Any], at: datetime | None) -> list[ConversationItem]:
        sub = payload.get("type")
        if kind == "event_msg":
            if sub == "user_message" and (text := str(payload.get("message") or "").strip()):
                return [self._item(ConversationItemKind.PROMPT, at, text=text)]
            if sub == "agent_message" and (text := str(payload.get("message") or "").strip()):
                return [self._item(ConversationItemKind.REPLY, at, text=text)]
            if sub == "exec_command_end" and payload.get("exit_code") not in (0, None):
                return self._finish(payload.get("call_id"), ItemStatus.ERROR)
            if sub in TURN_ENDS:
                return [self._item(ConversationItemKind.RESULT, at, status=ItemStatus.DONE)]
            if sub in ABORTED:
                reason = str(payload.get("reason") or "interrupted")
                return [self._item(ConversationItemKind.RESULT, at, text=reason, status=ItemStatus.ERROR)]
            if sub == "error" and (text := str(payload.get("message") or "").strip()):
                return [self._item(ConversationItemKind.RESULT, at, text=text, status=ItemStatus.ERROR)]
            return []
        if kind != "response_item":
            return []
        if sub in TOOL_CALLS:
            name, what = tool_of(payload)
            done = sub == "web_search_call" or payload.get("status") == "failed"
            status = (
                ItemStatus.ERROR
                if payload.get("status") == "failed"
                else ItemStatus.DONE
                if done
                else ItemStatus.RUNNING
            )
            if call_id := payload.get("call_id"):
                self._calls[str(call_id)] = self._seq
            return [self._item(ConversationItemKind.TOOL, at, tool_name=name, text=what, status=status)]
        if sub in TOOL_OUTPUTS:
            failed = FAILED.search(_output_text(payload.get("output")))
            return self._finish(payload.get("call_id"), ItemStatus.ERROR if failed else ItemStatus.DONE)
        return []
