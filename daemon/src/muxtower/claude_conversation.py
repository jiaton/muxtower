"""Claude Code's event log → conversation items (pure; no I/O). Shared by Remote Control (its event log)
and local transcripts (`~/.claude/projects/…/<session>.jsonl`, the same events, one per line).

Claude Code's stream-json events: `user` (prompts and tool results), `assistant` (prose and tool
calls), `control_request` from the worker (`can_use_tool`: a permission prompt; AskUserQuestion and
ExitPlanMode arrive this way too), `control_response` (any controller's answer) and `result` (turn
end). Everything else (system, progress, rate limits) is not conversation.
"""

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from muxtower.agent_text import describe_tool_input, tool_description
from muxtower.claude_next_step import WRAP_UP_TOOLS, next_step
from muxtower.sessions.models import ConversationItem, ConversationItemKind, ItemStatus


@dataclass(frozen=True)
class RawEvent:
    """One event of a session's log, unwrapped from its transport (an API envelope, a transcript line)."""

    seq: int
    created_at: str | None
    source: str | None  # "worker" (Claude Code) or "client" (a controller: claude.ai, the apps, us)
    payload: dict[str, Any] = field(default_factory=dict)


# A single event can produce several items (prose + tool calls); item seq = event seq * SLOTS + index.
SLOTS = 16
MAX_ITEMS = 400
# Injected context, not something a person typed.
SYNTHETIC_PREFIXES = ("<command-", "<local-command", "<system-reminder", "<task-notification", "Caveat:")
# A slash command as typed (`/loop 5m check the build`). What it expands to (a skill's prompt) comes in
# the next event, marked `isSynthetic` (`isMeta` in a transcript), and is not shown.
COMMAND = re.compile(r"<command-name>\s*(\S+?)\s*</command-name>(?:.*?<command-args>(.*?)</command-args>)?", re.S)
QUESTION_TOOLS = {"AskUserQuestion"}
UNLISTED_TOOLS = {"AskUserQuestion", "ExitPlanMode", *WRAP_UP_TOOLS}  # shown as their prompt, not as a tool call


@dataclass
class PendingRequest:
    request_id: str
    tool_name: str
    tool_input: dict[str, Any]
    tool_use_id: str | None
    item_seq: int

    @property
    def is_question(self) -> bool:
        return self.tool_name in QUESTION_TOOLS

    @property
    def question(self) -> dict[str, Any]:
        """The first question of an AskUserQuestion prompt; muxtower offers and answers that one."""
        questions = self.tool_input.get("questions") or []
        first = questions[0] if questions else None
        return first if isinstance(first, dict) else {}


def _at(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _typed(text: str) -> str | None:
    """A prompt as the person typed it: its text, a slash command as `/name args`, nothing if injected."""
    if command := COMMAND.search(text):
        name = command[1] if command[1].startswith("/") else f"/{command[1]}"
        return f"{name} {(command[2] or '').strip()}".strip()
    return None if text.startswith(SYNTHETIC_PREFIXES) else text


def _blocks(payload: dict[str, Any]) -> list[dict[str, Any]]:
    content = (payload.get("message") or {}).get("content")
    if isinstance(content, str):
        return [{"type": "text", "text": content}]
    return [b for b in content or [] if isinstance(b, dict)]


@dataclass
class ConversationBuilder:
    items: dict[int, ConversationItem] = field(default_factory=dict)
    latest_event_seq: int = 0
    _tools: dict[str, int] = field(default_factory=dict)  # tool_use_id -> item seq
    _requests: dict[str, PendingRequest] = field(default_factory=dict)  # unresolved prompts
    _next_steps: list[int] = field(default_factory=list)  # next_step items nobody has answered yet

    @property
    def pending(self) -> PendingRequest | None:
        """The newest prompt nobody has answered yet."""
        return max(self._requests.values(), key=lambda r: r.item_seq, default=None)

    @property
    def last_reply(self) -> str | None:
        for seq in sorted(self.items, reverse=True):
            if self.items[seq].kind == ConversationItemKind.REPLY:
                return self.items[seq].text
        return None

    def after(self, seq: int, limit: int) -> list[ConversationItem]:
        newer = [self.items[s] for s in sorted(self.items) if s > seq]
        return newer[-limit:] if seq == 0 else newer[:limit]

    def feed(self, events: list[RawEvent]) -> list[ConversationItem]:
        """Applies events in order (duplicates ignored); returns the items that are new or changed."""
        touched: dict[int, ConversationItem] = {}
        for event in sorted(events, key=lambda e: e.seq):
            if event.seq <= self.latest_event_seq:
                continue
            self.latest_event_seq = event.seq
            for item in self._apply(event):
                self.items[item.seq] = item
                touched[item.seq] = item
        for seq in sorted(self.items)[:-MAX_ITEMS]:
            del self.items[seq]
        return [touched[s] for s in sorted(touched)]

    def _set_status(self, item_seq: int, status: ItemStatus) -> ConversationItem | None:
        item = self.items.get(item_seq)
        if item is None or item.status == status:
            return None
        return item.model_copy(update={"status": status})

    def _apply(self, event: RawEvent) -> list[ConversationItem]:
        payload, kind = event.payload, event.payload.get("type")
        base = event.seq * SLOTS
        at = _at(event.created_at)
        out: list[ConversationItem] = []

        if kind == "user":
            texts = []
            for block in _blocks(payload):
                if block.get("type") == "tool_result":
                    seq = self._tools.get(str(block.get("tool_use_id")))
                    if seq is not None and (
                        done := self._set_status(seq, ItemStatus.ERROR if block.get("is_error") else ItemStatus.DONE)
                    ):
                        out.append(done)
                elif block.get("type") == "text" and not (payload.get("isSynthetic") or payload.get("isMeta")):
                    if text := _typed(str(block.get("text") or "").strip()):
                        texts.append(text)
            if texts:
                out.append(ConversationItem(seq=base, at=at, kind=ConversationItemKind.PROMPT, text="\n".join(texts)))
                out += [i for s in self._next_steps if (i := self._set_status(s, ItemStatus.ANSWERED))]
                self._next_steps.clear()

        elif kind == "assistant":
            prose = [str(b.get("text") or "") for b in _blocks(payload) if b.get("type") == "text"]
            prose_text = "\n".join(p for p in prose if p.strip()).strip()
            index = 0
            if prose_text:
                out.append(ConversationItem(seq=base, at=at, kind=ConversationItemKind.REPLY, text=prose_text))
                index = 1
            for block in _blocks(payload):
                name = str(block.get("name") or "")
                if index < SLOTS and (step := next_step(block, base + index, at)):
                    out.append(step)
                    self._next_steps.append(step.seq)
                    index += 1
                if block.get("type") != "tool_use" or name in UNLISTED_TOOLS or index >= SLOTS:
                    continue
                seq = base + index
                index += 1
                self._tools[str(block.get("id"))] = seq
                out.append(
                    ConversationItem(
                        seq=seq,
                        at=at,
                        kind=ConversationItemKind.TOOL,
                        tool_name=name,
                        text=describe_tool_input(block.get("input")),
                        description=tool_description(block.get("input")),
                        status=ItemStatus.RUNNING,
                    )  # fmt: skip
                )

        elif kind == "control_request" and event.source != "client":
            request = payload.get("request") or {}
            if request.get("subtype") == "can_use_tool":
                tool = str(request.get("tool_name") or "")
                raw_input = request.get("input")
                tool_input: dict[str, Any] = raw_input if isinstance(raw_input, dict) else {}
                pending = PendingRequest(
                    request_id=str(payload.get("request_id")), tool_name=tool, tool_input=tool_input,
                    tool_use_id=request.get("tool_use_id"), item_seq=base,
                )  # fmt: skip
                self._requests[pending.request_id] = pending
                item_kind = ConversationItemKind.QUESTION if pending.is_question else ConversationItemKind.APPROVAL
                out.append(
                    ConversationItem(
                        seq=base,
                        at=at,
                        kind=item_kind,
                        tool_name=tool,
                        text=describe_tool_input(tool_input),
                        status=ItemStatus.PENDING,
                    )  # fmt: skip
                )

        elif kind == "control_response":
            response = payload.get("response") or {}
            request_id = str(response.get("request_id") or payload.get("request_id") or "")
            resolved = self._requests.pop(request_id) if request_id in self._requests else None
            if resolved is not None:
                answer = response.get("response") or {}
                if resolved.is_question:
                    answers = (answer.get("updatedInput") or {}).get("answers")
                    status = ItemStatus.ANSWERED if answers else ItemStatus.DISMISSED
                else:
                    status = ItemStatus.ALLOWED if answer.get("behavior") == "allow" else ItemStatus.DENIED
                if changed := self._set_status(resolved.item_seq, status):
                    out.append(changed)

        elif kind == "control_cancel_request":
            cancel_id = str(payload.get("request_id") or "")
            cancelled = self._requests.pop(cancel_id) if cancel_id in self._requests else None
            if cancelled is not None and (changed := self._set_status(cancelled.item_seq, ItemStatus.CANCELLED)):
                out.append(changed)

        elif kind == "result":
            ok = payload.get("subtype") == "success" and not payload.get("is_error")
            out.append(
                ConversationItem(
                    seq=base,
                    at=at,
                    kind=ConversationItemKind.RESULT,
                    status=ItemStatus.DONE if ok else ItemStatus.ERROR,
                )
            )

        return out
