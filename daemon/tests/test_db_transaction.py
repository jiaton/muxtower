"""`Database.transaction`: several stores' writes in one commit; a store's own `connect` inside it is a
savepoint, so a failure it catches undoes only its own writes."""

from pathlib import Path

import pytest

from muxtower.infra.db import Database


def _db(tmp_path: Path) -> Database:
    db = Database(tmp_path / "t.db")
    with db.connect() as conn:
        conn.execute("CREATE TABLE t (v TEXT)")
    return db


def _values(db: Database) -> list[str]:
    with db.connect() as conn:
        return [r["v"] for r in conn.execute("SELECT v FROM t ORDER BY v")]


def test_all_or_nothing(tmp_path: Path) -> None:
    db = _db(tmp_path)
    with pytest.raises(RuntimeError), db.transaction():
        with db.connect() as conn:
            conn.execute("INSERT INTO t VALUES ('a')")
        with db.connect() as conn:
            conn.execute("INSERT INTO t VALUES ('b')")
        raise RuntimeError("partway")
    assert _values(db) == []
    with db.transaction():
        with db.connect() as conn:
            conn.execute("INSERT INTO t VALUES ('a')")
        with db.transaction(), db.connect() as conn:  # nested: still the one commit
            conn.execute("INSERT INTO t VALUES ('b')")
    assert _values(db) == ["a", "b"]


def test_a_caught_failure_inside_undoes_only_its_own(tmp_path: Path) -> None:
    db = _db(tmp_path)
    with db.transaction():
        with db.connect() as conn:
            conn.execute("INSERT INTO t VALUES ('kept')")
        try:
            with db.connect() as conn:
                conn.execute("INSERT INTO t VALUES ('undone')")
                raise ValueError("caught by its caller")
        except ValueError:
            pass
    assert _values(db) == ["kept"]
    with db.connect() as conn:  # outside one, as before: its own commit
        conn.execute("INSERT INTO t VALUES ('z')")
    assert _values(db) == ["kept", "z"]
