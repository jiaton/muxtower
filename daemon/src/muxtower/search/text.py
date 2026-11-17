"""What full-text search reads of a conversation, and how its text is matched: prompts and replies only
(tools' output and files left out), each capped, Chinese, Japanese and Korean split into single
characters so a word of any length is found (FTS5's unicode61 keeps a run of them as one token; its
trigram tokenizer cannot find two characters)."""

import json
import re
from collections.abc import Iterator
from dataclasses import dataclass

from muxtower.claude_conversation import SLOTS, _blocks, _typed
from muxtower.sessions.models import ConversationItem, ConversationItemKind
from muxtower.sessions.transcripts import _event

CAP = 2000  # characters of one item that are indexed
CJK = "぀-ヿ㐀-䶿一-鿿가-힯＀-￯"
_CJK = re.compile(f"([{CJK}])")
HIT, END = "\x02", "\x03"  # around a match, in a snippet


@dataclass(frozen=True)
class Row:
    seq: int
    at: str | None
    role: str  # user | agent
    text: str


def split(text: str) -> str:
    """Indexed as: every CJK character a word of its own."""
    return _CJK.sub(r" \1 ", text)


def unsplit(text: str) -> str:
    """A snippet as it was written: the spaces `split` put around CJK characters taken out again."""
    text = re.sub(f"(?<=[{CJK}{HIT}{END}]) +(?=[{CJK}{HIT}{END}])", "", text)
    text = re.sub(f"(?<=[{CJK}]) +(?=[{HIT}{END}]?[{CJK}])", "", text)
    return re.sub(" {2,}", " ", text).strip()


def match_query(q: str) -> str | None:
    """Typed text as an FTS5 query: every word must be there; a word of Latin letters may be the start of
    one, CJK characters are matched as a run. None when nothing is left to match."""
    parts = []
    for word in q.replace('"', " ").split():
        if _CJK.search(word):
            chars = split(word).split()
            parts.append('"' + " ".join(chars) + '"')
        elif any(c.isalnum() for c in word):
            parts.append(f'"{word}"*')
    return " ".join(parts) or None


def claude_rows(lines: list[bytes], first_line: int) -> Iterator[Row]:
    """A Claude Code transcript's prompts and replies among these lines (the first is line `first_line`),
    with the seq its conversation gives them (`ClaudeTranscript`: one event a line)."""
    for n, line in enumerate(lines, first_line):
        if b'"user"' not in line and b'"assistant"' not in line:
            continue  # neither: skipped before parsing
        event = _event(line, n)
        if event is None:
            continue
        payload, kind = event.payload, event.payload.get("type")
        if kind == "user" and not (payload.get("isSynthetic") or payload.get("isMeta")):
            texts = [
                t
                for b in _blocks(payload)
                if b.get("type") == "text"
                if (t := _typed(str(b.get("text") or "").strip()))
            ]
            if texts:
                yield Row(n * SLOTS, event.created_at, "user", "\n".join(texts)[:CAP])
        elif kind == "assistant":
            text = "\n".join(str(b.get("text") or "") for b in _blocks(payload) if b.get("type") == "text").strip()
            if text:
                yield Row(n * SLOTS, event.created_at, "agent", text[:CAP])


def item_rows(items: list[ConversationItem]) -> list[Row]:
    """Conversation items (Codex's, Remote Control's, an archive's): their prompts and replies."""
    roles = {ConversationItemKind.PROMPT: "user", ConversationItemKind.REPLY: "agent"}
    return [
        Row(i.seq, i.at.isoformat() if i.at else None, roles[i.kind], (i.text or "")[:CAP])
        for i in items
        if i.kind in roles and (i.text or "").strip()
    ]


def items_from_json(items: str | None) -> list[ConversationItem]:
    try:
        return [ConversationItem.model_validate(i) for i in json.loads(items or "[]")]
    except ValueError:
        return []
