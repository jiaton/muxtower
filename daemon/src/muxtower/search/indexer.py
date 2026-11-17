"""Keeps the full-text index (`index.py`) up with the conversations this daemon has, in a thread of its own
at the lowest CPU and IO priority, never on the event loop and never per item:

- Claude Code transcripts are read on from where the last read stopped (bytes and lines kept in the
  index, so a restart goes on, never starts over), at most `budget` bytes a tick: a backfill is spread out,
  and slower still while a session is working;
- Codex rollouts, Remote Control conversations and archived conversations kept as items are read again
  whole when they changed (they are small), at most a few a tick;
- a source no session has any more is dropped.

Only prompts and replies are indexed, each capped (`text.py`). A node indexes its own sessions; the hub
asks it (`search.service`). Off (`search.full_text`), it does nothing and the index file is deleted."""

import ctypes
import logging
import os
import sys
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from functools import partial
from typing import Any

from muxtower.runtimes.models import AgentState
from muxtower.search.index import SearchIndex, Source
from muxtower.search.text import Row, claude_rows, item_rows, items_from_json
from muxtower.sessions.transcripts import builder_for

logger = logging.getLogger("muxtower.search")

TICK_SECONDS = 5.0
BUDGET_BYTES = 20 * 1024 * 1024  # read a tick (4 MB/s); a quarter while a session works
ITEM_SOURCES_A_TICK = 3  # conversations fetched whole a tick (Remote Control's ask its API)
SWEEP_TICKS = 12  # sources no session has any more: dropped this often
ROLLOUT_MAX = 32 * 1024 * 1024  # a Codex rollout read again whole up to this size
ITEMS_LIMIT = 400


@dataclass(frozen=True)
class Target:
    key: str
    session: str
    path: str | None = None  # a transcript file
    stamp: str | None = None  # an items source's: what changes when it does
    items: Callable[[], list[Any]] | None = None


def _conversation(directory: Any, session_id: str) -> list[Any]:
    return list(directory.conversation(session_id, 0, ITEMS_LIMIT).items)


def _lowest_priority() -> None:
    """This thread at nice 19, and (Linux) the idle IO class: indexing gives way to everything else."""
    tid = threading.get_native_id()
    try:
        os.setpriority(os.PRIO_PROCESS, tid, 19)
    except (AttributeError, OSError):
        pass
    if sys.platform == "linux":
        try:  # ioprio_set(IOPRIO_WHO_PROCESS, tid, IOPRIO_CLASS_IDLE << 13); x86_64 251, aarch64 30
            number = {"x86_64": 251, "aarch64": 30}.get(os.uname().machine)
            if number:
                ctypes.CDLL(None, use_errno=True).syscall(number, 1, tid, 3 << 13)
        except (OSError, AttributeError):
            pass


class Indexer:
    def __init__(
        self, index: SearchIndex, directory: Any, archive: Any, enabled: Callable[[], bool],
        budget: int = BUDGET_BYTES, tick: float = TICK_SECONDS,
    ) -> None:  # fmt: skip
        self.index = index
        self.directory = directory
        self.archive = archive
        self.enabled = enabled
        self.budget = budget
        self.tick_seconds = tick
        self._ticks = 0
        self._stop = threading.Event()
        self.read_bytes = 0  # since start: for the numbers it reports
        self.rows = 0
        self.caught_up = False  # the last round found nothing left to read

    # --- what to index ----------------------------------------------------------------------------

    def targets(self) -> tuple[list[Target], bool]:
        """Every source to keep indexed, and whether a session here is working (reads slower then)."""
        found: list[Target] = []
        busy = False
        d = self.directory
        for s in d.list():
            if s.node:
                continue  # its node indexes it
            busy = busy or s.state == AgentState.BUSY
            if s.archived_at:
                record = self.archive.record(s.id) if self.archive else None
                if record is None:
                    continue
                if record.transcript:
                    found.append(Target(f"file:{record.transcript}", s.id, path=record.transcript))
                elif record.items:
                    found.append(Target(f"items:{s.id}", s.id, stamp=record.archived_at.isoformat(),
                                        items=partial(items_from_json, record.items)))  # fmt: skip
                continue
            path = None
            if d.local.repo.get(s.id) is not None:
                try:
                    path = d.local.transcript_of(s.id)
                except Exception:  # noqa: BLE001 - not known yet: next time
                    path = None
            if path:
                found.append(Target(f"file:{path}", s.id, path=path))
            elif s.capabilities.conversation:
                found.append(Target(f"items:{s.id}", s.id, stamp=s.updated_at.isoformat() if s.updated_at else None,
                                    items=partial(_conversation, d, s.id)))  # fmt: skip
        return found, busy

    # --- one tick ---------------------------------------------------------------------------------

    def tick(self) -> int:
        """Blocking: one round within the budget; returns the rows added."""
        if not self.enabled():
            self.caught_up = False
            if self.index.path.exists():
                logger.info("full-text search is off: its index is deleted")
                self.index.delete()
            return 0
        targets, busy = self.targets()
        budget = self.budget // 4 if busy else self.budget
        added, fetched = 0, 0
        known = {s.key: s for s in self.index.sources()}
        for t in targets:
            if t.path:
                if budget <= 0:
                    continue
                n, used = self._file(t, known.get(t.key), budget)
                added, budget = added + n, budget - used
            elif fetched < ITEM_SOURCES_A_TICK:
                was = known.get(t.key)
                if was and was.stamp == t.stamp and was.session == t.session:
                    continue
                fetched += 1
                added += self._items(t)
        self._ticks += 1
        if self._ticks % SWEEP_TICKS == 0:
            keep = {t.key for t in targets}
            gone = [k for k in known if k not in keep]
            if gone:
                self.index.forget(gone)
        self.rows += added
        self.caught_up = added == 0 and budget > 0 and fetched == 0
        return added

    def _file(self, t: Target, was: Source | None, limit: int) -> tuple[int, int]:
        """Rows added from a transcript, and the bytes read for them."""
        assert t.path is not None
        try:
            st = os.stat(t.path)
        except OSError:
            return 0, 0
        stamp = f"{st.st_size}:{st.st_mtime_ns}"
        if was and was.stamp == stamp and was.session == t.session:
            return 0, 0
        if os.path.basename(t.path).startswith("rollout-"):
            return self._rollout(t, stamp, st.st_size), st.st_size
        offset, line = (was.offset, was.line) if was and was.offset <= st.st_size else (0, 0)
        replace = was is not None and (was.offset > st.st_size)  # rewritten: from the start
        lines: list[bytes] = []
        used = 0
        try:
            with open(t.path, "rb") as f:
                f.seek(offset)
                while used < limit:
                    raw = f.readline()
                    if not raw or not raw.endswith(b"\n"):
                        break  # the end, or a line still being written
                    lines.append(raw)
                    used += len(raw)
        except OSError:
            return 0, 0
        done = offset + used >= st.st_size
        rows = list(claude_rows(lines, line + 1))
        source = Source(t.key, t.session, offset + used, line + len(lines), stamp if done else None)
        self.read_bytes += used
        return self.index.add(source, rows, replace=replace), used

    def _rollout(self, t: Target, stamp: str, size: int) -> int:
        if size > ROLLOUT_MAX:
            return 0
        try:
            with open(t.path or "", "rb") as f:
                builder = builder_for(t.path or "")
                items = builder.feed_lines(f.read().splitlines())
        except OSError:
            return 0
        self.read_bytes += size
        return self.index.add(Source(t.key, t.session, size, 0, stamp), item_rows(items), replace=True)

    def _items(self, t: Target) -> int:
        try:
            rows: list[Row] = item_rows(t.items() if t.items else [])
        except Exception as exc:  # noqa: BLE001 - a source not answering now: next time
            logger.debug("could not read %s for the index: %s", t.key, exc)
            return 0
        return self.index.add(Source(t.key, t.session, 0, 0, t.stamp), rows, replace=True)

    # --- its thread -------------------------------------------------------------------------------

    def start(self) -> threading.Thread:
        thread = threading.Thread(target=self._run, name="search-index", daemon=True)
        thread.start()
        return thread

    def stop(self) -> None:
        self._stop.set()

    def _run(self) -> None:
        _lowest_priority()
        started, reported = time.monotonic(), False
        while not self._stop.is_set():
            try:
                added = self.tick()
                if not added and not reported and self.read_bytes:
                    reported = True
                    logger.info(
                        "search index caught up: %.0f MB read, %d items, index %.1f MB, %.0f s",
                        self.read_bytes / 1e6, self.rows, self.index.size() / 1e6, time.monotonic() - started,
                    )  # fmt: skip
            except Exception:
                logger.exception("search indexing failed this round")
            self._stop.wait(self.tick_seconds)
