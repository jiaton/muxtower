"""The full-text index of conversations: a SQLite FTS5 table in a file of its own (WAL), so a slow write
there never holds up muxtower's own database; and where each source was read to (`sources`), so a restart
goes on from there instead of reading everything again."""

import sqlite3
import threading
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from muxtower.search.text import END, HIT, Row, match_query, split, unsplit

SNIPPET_TOKENS = 16
MAX_LIMIT = 50

SCHEMA = """
CREATE VIRTUAL TABLE IF NOT EXISTS items USING fts5(
    body, session UNINDEXED, source UNINDEXED, seq UNINDEXED, at UNINDEXED, role UNINDEXED,
    tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TABLE IF NOT EXISTS sources (
    key TEXT PRIMARY KEY,   -- file:<path>, or items:<session>
    session TEXT NOT NULL,
    offset INTEGER NOT NULL DEFAULT 0,  -- bytes read (a file)
    line INTEGER NOT NULL DEFAULT 0,    -- lines read (a file)
    stamp TEXT                          -- what it was when read: size and mtime, or the session's updated_at
);
"""


@dataclass(frozen=True)
class Source:
    key: str
    session: str
    offset: int
    line: int
    stamp: str | None


@dataclass(frozen=True)
class Found:
    session: str
    seq: int
    at: str | None
    role: str
    snippet: str  # HIT … END around the matches
    rank: float


class SearchIndex:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._write = threading.Lock()
        self._conn: sqlite3.Connection | None = None

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=5, check_same_thread=False)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.executescript(SCHEMA)
        return conn

    def _writer(self) -> sqlite3.Connection:
        if self._conn is None:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self._conn = self._connect()
        return self._conn

    def source(self, key: str) -> Source | None:
        with self._write:
            row = self._writer().execute("SELECT * FROM sources WHERE key = ?", (key,)).fetchone()
        return Source(*row) if row else None

    def sources(self) -> list[Source]:
        with self._write:
            return [Source(*r) for r in self._writer().execute("SELECT * FROM sources")]

    def add(self, source: Source, rows: Iterable[Row], replace: bool = False) -> int:
        """Rows of a source, and where it was read to, in one transaction; `replace`: its rows so far go."""
        values = [(split(r.text), source.session, source.key, r.seq, r.at, r.role) for r in rows]
        with self._write:
            conn = self._writer()
            with conn:
                if replace:
                    conn.execute("DELETE FROM items WHERE source = ?", (source.key,))
                conn.executemany(
                    "INSERT INTO items (body, session, source, seq, at, role) VALUES (?, ?, ?, ?, ?, ?)", values
                )
                conn.execute(
                    "INSERT OR REPLACE INTO sources (key, session, offset, line, stamp) VALUES (?, ?, ?, ?, ?)",
                    (source.key, source.session, source.offset, source.line, source.stamp),
                )
                old = conn.execute(
                    "SELECT 1 FROM items WHERE source = ? AND session != ? LIMIT 1", (source.key, source.session)
                )
                if old.fetchone():  # the same file, under another session now (resumed, archived): moved along
                    conn.execute("UPDATE items SET session = ? WHERE source = ?", (source.session, source.key))
        return len(values)

    def forget(self, keys: Iterable[str]) -> None:
        with self._write:
            conn = self._writer()
            with conn:
                for key in keys:
                    conn.execute("DELETE FROM items WHERE source = ?", (key,))
                    conn.execute("DELETE FROM sources WHERE key = ?", (key,))

    def search(self, q: str, limit: int = 20) -> list[Found]:
        """The best matches, a snippet each (its own connection: a search never waits on the writer)."""
        match = match_query(q)
        if match is None or not self.path.exists():
            return []
        conn = sqlite3.connect(f"file:{self.path}?mode=ro", uri=True, timeout=1)
        try:
            rows = conn.execute(
                "SELECT session, seq, at, role, snippet(items, 0, ?, ?, '…', ?), rank FROM items "
                "WHERE items MATCH ? ORDER BY rank LIMIT ?",
                (HIT, END, SNIPPET_TOKENS, match, max(1, min(limit, MAX_LIMIT))),
            ).fetchall()
        except sqlite3.OperationalError:
            return []  # a query FTS5 cannot read, or no index yet
        finally:
            conn.close()
        return [Found(s, int(seq), at, role, unsplit(snip), float(rank)) for s, seq, at, role, snip, rank in rows]

    def size(self) -> int:
        return sum(p.stat().st_size for p in self.path.parent.glob(self.path.name + "*") if p.exists())

    def delete(self) -> None:
        """The index gone, file and all (full-text search turned off)."""
        with self._write:
            if self._conn is not None:
                self._conn.close()
                self._conn = None
            for p in self.path.parent.glob(self.path.name + "*"):
                p.unlink(missing_ok=True)
