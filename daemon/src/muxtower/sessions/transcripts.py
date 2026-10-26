"""The conversation of a tmux session's agent, read from its transcript file.

Claude Code writes every event of a session to `~/.claude/projects/<folder>/<session>.jsonl`, one JSON
object per line, in the same shape as Remote Control's event log, so the same builder turns it into
conversation items. This is where the history of a full-screen Claude Code lives: it draws on the
terminal's alternate screen, so tmux keeps no scrollback. Codex writes rollout files
(`agents/codex/rollout.py`); which format a file is in, its name says (`builder_for`).

A transcript is read once when its conversation is first asked for (its last part, enough for
FIRST_ITEMS items), then followed: `poll` reads what was appended and returns the new items. Subagent
(sidechain) and meta lines are not the conversation.
"""

import asyncio
import json
import logging
import os
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

from muxtower.agents.codex.rollout import RolloutBuilder
from muxtower.claude_conversation import ConversationBuilder, RawEvent
from muxtower.infra.bus import EventBus
from muxtower.sessions.models import Conversation, ConversationItem

logger = logging.getLogger("muxtower.transcripts")

# A first read takes the end of the transcript, growing until it holds enough of the conversation
# (tool output and images make some transcripts tens of megabytes).
TAILS = (4_000_000, 16_000_000, 64_000_000)
FIRST_ITEMS = 150
POLL_SECONDS = 1.5
KINDS = {"user", "assistant"}


class TranscriptFormat(Protocol):
    """Lines of one kind of transcript → conversation items."""

    items: dict[int, ConversationItem]

    def feed_lines(self, lines: list[bytes]) -> list[ConversationItem]: ...
    def after(self, seq: int, limit: int) -> list[ConversationItem]: ...


def builder_for(path: str) -> TranscriptFormat:
    """Codex's rollout files by their name, Claude Code's transcripts otherwise."""
    return RolloutBuilder() if os.path.basename(path).startswith("rollout-") else ClaudeTranscript()


@dataclass
class _Followed:
    path: str
    offset: int = 0
    partial: bytes = b""
    builder: TranscriptFormat = field(init=False)

    def __post_init__(self) -> None:
        self.builder = builder_for(self.path)


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


class ClaudeTranscript(ConversationBuilder):
    """Claude Code's transcript lines, as events of its Remote Control log (one per line)."""

    def __init__(self) -> None:
        super().__init__()
        self._seq = 0

    def feed_lines(self, lines: list[bytes]) -> list[ConversationItem]:
        events = []
        for line in lines:
            self._seq += 1
            if event := _event(line, self._seq):
                events.append(event)
        return self.feed(events)


class Transcripts:
    def __init__(self) -> None:
        self._followed: dict[str, _Followed] = {}
        self._lock = threading.Lock()

    def _read(self, followed: _Followed) -> list[ConversationItem]:
        """Blocking: the lines appended since the last read, into the builder; returns new items."""
        try:
            size = os.path.getsize(followed.path)
            if size < followed.offset:  # rewritten: start over
                followed.offset, followed.partial, followed.builder = 0, b"", builder_for(followed.path)
            if size == followed.offset:
                return []
            if followed.offset == 0:
                return self._first(followed, size)
            with open(followed.path, "rb") as f:
                f.seek(followed.offset)
                chunk = followed.partial + f.read()
                followed.offset = f.tell()
        except OSError as exc:
            logger.warning("cannot read transcript %s: %s", followed.path, exc)
            return []
        return self._feed(followed, chunk)

    def _first(self, followed: _Followed, size: int) -> list[ConversationItem]:
        for tail in (*TAILS, size):
            followed.builder = builder_for(followed.path)
            with open(followed.path, "rb") as f:
                if size > tail:
                    f.seek(size - tail)
                    f.readline()  # skip the cut line
                chunk = f.read()
                followed.offset = f.tell()
            items = self._feed(followed, chunk)
            if len(followed.builder.items) >= FIRST_ITEMS or size <= tail:
                return items
        return items

    def _feed(self, followed: _Followed, chunk: bytes) -> list[ConversationItem]:
        *lines, followed.partial = chunk.split(b"\n")
        return followed.builder.feed_lines(lines)

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
