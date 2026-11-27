"""Each mark is written on its own: no other writer (another mark, a carry, a stale copy in another
instance on the same database) puts an old value back."""

import threading
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

import pytest

from muxtower.infra.db import Database
from muxtower.sessions.marks import Marks, MarksRepository, SessionMarks, SqliteMarksRepository

T0 = datetime(2026, 10, 25, 12, 0, tzinfo=UTC)


def database(tmp_path: Path) -> Database:
    db = Database(tmp_path / "db.sqlite")
    db.migrate()
    return db


def owned(m: SessionMarks) -> None:
    """The owner's marks, each away from its default."""
    m.pin("s", True)
    m.hide("s", True)
    m.set_notify("s", "off")
    m.set_auto_read("s", True)
    m.place("s", "build-box", "/srv/acme")


OWNED = {"pinned": True, "hidden": True, "notify": "off", "auto_read": True, "machine": "build-box",
         "folder": "/srv/acme"}  # fmt: skip

WRITERS: dict[str, Callable[[SessionMarks], None]] = {
    "finished": lambda m: m.finished("s", T0),
    "seen": lambda m: m.seen("s", T0),
    "mark_unread": lambda m: m.mark_unread("s"),
    "turn_finished": lambda m: m.turn_finished("s", T0),
    "place": lambda m: m.place("s", "build-box", "/srv/acme"),
    "carry_from_unmarked": lambda m: m.carry("plain", "s", unread=False),
    "carry_onto_itself": lambda m: m.carry("s", "s", unread=True),
}


def kept(m: Marks) -> dict[str, object]:
    return {name: getattr(m, name) for name in OWNED}


@pytest.mark.parametrize("writer", WRITERS)
def test_the_owners_marks_survive_every_other_writer(tmp_path: Path, writer: str) -> None:
    db = database(tmp_path)
    m = SessionMarks(SqliteMarksRepository(db))
    owned(m)
    WRITERS[writer](m)
    assert kept(m.get("s")) == OWNED
    assert kept(SessionMarks(SqliteMarksRepository(db)).get("s")) == OWNED  # and in SQLite


@pytest.mark.parametrize("writer", WRITERS)
def test_a_stale_second_instance_never_writes_back_marks_it_did_not_change(tmp_path: Path, writer: str) -> None:
    db = database(tmp_path)
    a = SessionMarks(SqliteMarksRepository(db))
    b = SessionMarks(SqliteMarksRepository(db))  # loaded before A's marks: its copy is stale
    owned(a)
    WRITERS[writer](b)
    assert kept(SessionMarks(SqliteMarksRepository(db)).get("s")) == OWNED


def test_a_pin_by_one_instance_survives_the_others_finished_and_seen(tmp_path: Path) -> None:
    db = database(tmp_path)
    a, b = SessionMarks(SqliteMarksRepository(db)), SessionMarks(SqliteMarksRepository(db))
    a.pin("s", True)
    b.finished("s", T0)
    b.seen("s", T0)
    after = SessionMarks(SqliteMarksRepository(db)).get("s")
    assert after.pinned and after.finished_at == T0 and after.seen_at == T0


class _Racing:
    """Lets the first save wait until a later one has landed: the order threads may reach the database in."""

    def __init__(self, repo: MarksRepository) -> None:
        self.repo, self.first, self.later_saved = repo, True, threading.Event()

    def load(self) -> dict[str, Marks]:
        return self.repo.load()

    def save(self, session_id: str, changes: dict[str, object]) -> None:
        if self.first:
            self.first = False
            threading.Thread(target=self.later, daemon=True).start()
            assert self.later_saved.wait(5)
        self.repo.save(session_id, changes)

    later: Callable[[], None]


def test_a_pin_survives_a_heartbeat_saved_after_it(tmp_path: Path) -> None:
    """A client's `seen` built before the pin but written after it (threads racing for the database)."""
    db = database(tmp_path)
    repo = _Racing(SqliteMarksRepository(db))
    m = SessionMarks(repo)

    def pin() -> None:
        m.pin("s", True)
        repo.later_saved.set()

    repo.later = pin
    m.seen("s", T0)  # its save waits until the pin is saved
    assert SessionMarks(SqliteMarksRepository(db)).get("s").pinned


def test_carry_copies_the_marks_onto_a_new_session(tmp_path: Path) -> None:
    m = SessionMarks(SqliteMarksRepository(database(tmp_path)))
    m.pin("old", True)
    m.hide("old", True)
    m.set_notify("old", "off")
    m.set_auto_read("old", True)
    m.carry("old", "new", unread=True)
    new = m.get("new")
    assert (new.pinned, new.hidden, new.notify, new.auto_read, new.marked_unread) == (True, True, "off", True, True)


def test_carry_never_resets_the_marks_the_new_session_already_has(tmp_path: Path) -> None:
    db = database(tmp_path)
    m = SessionMarks(SqliteMarksRepository(db))
    m.pin("new", True)
    m.set_notify("new", "needs")
    m.set_auto_read("new", True)
    m.carry("old", "new", unread=False)  # the old one had no marks at all
    for new in (m.get("new"), SessionMarks(SqliteMarksRepository(db)).get("new")):
        assert (new.pinned, new.notify, new.auto_read) == (True, "needs", True)
