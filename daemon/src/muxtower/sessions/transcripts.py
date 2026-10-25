"""The conversation of a tmux session's Claude Code, read from its transcript file.

Claude Code writes every event of a session to `~/.claude/projects/<folder>/<session>.jsonl`, one JSON
object per line, in the same shape as Remote Control's event log, so the same builder turns it into
conversation items. This is where the history of a full-screen Claude Code lives: it draws on the
terminal's alternate screen, so tmux keeps no scrollback.

A transcript is read once when its conversation is first asked for (only its last part when it is large),
then followed: `poll` reads what was appended and returns the new items. Subagent (sidechain) and meta
lines are not the conversation.
"""

import asyncio
import json
import logging
import os
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from muxtower.claude_conversation import ConversationBuilder, RawEvent
from muxtower.infra.bus import EventBus
from muxtower.sessions.models import Conversation, ConversationItem

logger = logging.getLogger("muxtower.transcripts")

TAIL_BYTES = 3_000_000  # a first read starts this far from the end of a large transcript
POLL_SECONDS = 1.5
KINDS = {"user", "assistant"}


@dataclass
class _Followed:
    path: str
    offset: int = 0
    seq: int = 0
    partial: bytes = b""
    builder: ConversationBuilder = field(default_factory=ConversationBuilder)


def _event(line: bytes, seq: int) -> RawEvent | None:
    try:
        payload: Any = json.loads(line)
    except ValueError:
        return None
    if not isinstance(payload, dict) or payload.get("type") not in KINDS:
        return None
    if payload.get("isSidechain") or payload.get("isMeta") or payload.get("isCompactSummary"):
        return None
    worker = "worker" if payload.get("type") == "assistant" else "client"
    return RawEvent(seq=seq, created_at=payload.get("timestamp"), source=worker, payload=payload)


class Transcripts:
    def __init__(self) -> None:
        self._followed: dict[str, _Followed] = {}
        self._lock = threading.Lock()

    def _read(self, followed: _Followed) -> list[ConversationItem]:
        """Blocking: the lines appended since the last read, into the builder; returns new items."""
        try:
            size = os.path.getsize(followed.path)
            if size < followed.offset:  # rewritten: start over
                followed.offset, followed.partial, followed.builder = 0, b"", ConversationBuilder()
            if size == followed.offset:
                return []
            with open(followed.path, "rb") as f:
                if followed.offset == 0 and size > TAIL_BYTES:
                    f.seek(size - TAIL_BYTES)
                    f.readline()  # skip the cut line
                else:
                    f.seek(followed.offset)
                chunk = followed.partial + f.read()
                followed.offset = f.tell()
        except OSError as exc:
            logger.warning("cannot read transcript %s: %s", followed.path, exc)
            return []
        *lines, followed.partial = chunk.split(b"\n")
        events = []
        for line in lines:
            followed.seq += 1
            if event := _event(line, followed.seq):
                events.append(event)
        return followed.builder.feed(events)

    def conversation(self, session_id: str, path: str, after: int, limit: int) -> Conversation:
        with self._lock:
            followed = self._followed.get(session_id)
            if followed is None or followed.path != path:  # a new Claude Code session (/clear, resume)
                followed = self._followed[session_id] = _Followed(path)
            self._read(followed)
            items = followed.builder.after(after, limit)
            latest = max(followed.builder.items, default=0)
        return Conversation(session_id=session_id, items=items, latest_seq=latest)

    def poll(self, paths: dict[str, str]) -> dict[str, list[ConversationItem]]:
        """Blocking. New items of the transcripts being followed (`paths`: session id → its transcript now);
        stops following sessions that are gone or moved to another transcript."""
        news: dict[str, list[ConversationItem]] = {}
        with self._lock:
            for session_id in list(self._followed):
                followed = self._followed[session_id]
                if paths.get(session_id) != followed.path:
                    del self._followed[session_id]
                elif items := self._read(followed):
                    news[session_id] = items
        return news

    async def run_loop(self, bus: EventBus, paths: Callable[[], dict[str, str]]) -> None:
        while True:
            try:
                for session_id, items in (await asyncio.to_thread(lambda: self.poll(paths()))).items():
                    bus.publish(f"conversation:{session_id}", items)
            except Exception:
                logger.exception("transcript poll failed")
            await asyncio.sleep(POLL_SECONDS)
