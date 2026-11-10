"""Where Remote Control sessions came from is worked out once and kept: a restart reads no log for it."""

from pathlib import Path

from muxtower.infra.db import Database
from muxtower.sources.remote_control.lineage_store import SqliteLineageStore
from muxtower.sources.remote_control.ports import RawEvent
from muxtower.sources.remote_control.service import RemoteControlSource
from tests.rc_fakes import FakeRemoteControl, session
from tests.test_rc_lineage import _written, history, say


class Counting(FakeRemoteControl):
    """Counts the log reads lineage makes: from the start (`events_after` from 0) and searches."""

    def __init__(self) -> None:
        super().__init__()
        self.reads: list[str] = []

    def events_after(self, session_id: str, after_seq: int, limit: int) -> list[RawEvent]:
        if after_seq == 0:
            self.reads.append(f"start:{session_id}")
        return super().events_after(session_id, after_seq, limit)

    def events_before(self, session_id: str, before_seq: int | None, limit: int) -> list[RawEvent]:
        self.reads.append(f"search:{session_id}")
        return super().events_before(session_id, before_seq, limit)


def _port() -> Counting:
    port = Counting()
    port.sessions = [
        session("cse_acme", title="Acme onboarding", created_at="2026-10-20T17:43Z", last_event_at="2026-11-10T16:56Z"),
        session("cse_plain", title="Weekly notes", created_at="2026-10-25T09:00Z", last_event_at="2026-11-09T09:00Z"),
        session("cse_fork", title="first week", created_at="2026-11-06T19:57Z", last_event_at="2026-11-07T01:59Z"),
        session("cse_orphan", title="renamed", created_at="2026-11-07T10:00Z", last_event_at="2026-11-07T11:00Z"),
    ]
    port.events = {
        "cse_acme": [
            *history(),
            say(1394, "2026-11-05T22:40:04Z", "user", "m1394"),
            say(1395, "2026-11-05T22:40:08Z", "assistant", "m1395"),
        ],
        "cse_plain": [say(1, "2026-10-25T09:00:01Z", "user", "p1"), say(2, "2026-10-25T09:00:05Z", "assistant", "p2")],
        "cse_fork": [
            _written(say(1, "2026-11-06T19:57:47.929Z", "user", "m1394"), "2026-11-05T22:39:57.961Z"),
            _written(say(2, "2026-11-06T19:57:47.929Z", "assistant", "m1395"), "2026-11-05T22:40:08.395Z"),
            say(3, "2026-11-06T20:00:00Z", "user", "f1"),
        ],
        # A copy of a conversation no listed session holds: a negative answer.
        "cse_orphan": [
            _written(say(1, "2026-11-07T10:00:01Z", "user", "zz1"), "2026-11-01T08:00:00Z"),
            _written(say(2, "2026-11-07T10:00:01Z", "assistant", "zz2"), "2026-11-01T08:00:05Z"),
            say(3, "2026-11-07T10:05:00Z", "user", "o1"),
        ],
    }  # fmt: skip
    return port


def _start(port: Counting, db: Database) -> RemoteControlSource:
    src = RemoteControlSource(port, {})
    src.lineages = SqliteLineageStore(db)
    src.tick()
    src.searched(5)
    return src


def _db(tmp_path: Path) -> Database:
    db = Database(tmp_path / "m.db")
    db.migrate()
    return db


def test_a_restart_reads_no_log_to_place_its_sessions_again(tmp_path: Path) -> None:
    db = _db(tmp_path)
    port = _port()
    first = _start(port, db)
    assert {v.id: v.fork_of for v in first.views()}["cse_fork"] == "cse_acme"
    assert any(r.startswith("search:") for r in port.reads)

    port.reads.clear()
    again = _start(port, db)  # a new daemon on the same database
    assert {v.id: v.fork_of for v in again.views()} == {
        "cse_acme": None, "cse_plain": None, "cse_fork": "cse_acme", "cse_orphan": None,
    }  # fmt: skip
    assert port.reads == []


def test_negative_answers_are_kept(tmp_path: Path) -> None:
    db = _db(tmp_path)
    _start(_port(), db)
    with db.connect() as conn:
        hows = {r["session_id"]: r["how"] for r in conn.execute("SELECT session_id, how FROM rc_lineage")}
    assert hows == {
        "cse_acme": "not-a-copy", "cse_plain": "not-a-copy",
        "cse_fork": "searched-found", "cse_orphan": "searched-none",
    }  # fmt: skip


def test_a_fork_made_while_running_is_searched_once(tmp_path: Path) -> None:
    db = _db(tmp_path)
    port = _port()
    src = _start(port, db)
    port.reads.clear()
    port.sessions.append(
        session("cse_new", title="later", created_at="2026-11-10T08:00Z", last_event_at="2026-11-10T08:30Z")
    )
    port.events["cse_new"] = [
        _written(say(1, "2026-11-10T08:00:01Z", "user", "p1"), "2026-10-25T09:00:01Z"),
        _written(say(2, "2026-11-10T08:00:01Z", "assistant", "p2"), "2026-10-25T09:00:05Z"),
        say(3, "2026-11-10T08:01:00Z", "user", "n1"),
    ]
    for _ in range(3):
        src.tick()
        src.searched(5)
    assert src.get("cse_new").fork_of == "cse_plain"  # same first message: placed with no search at all
    assert port.reads == ["start:cse_new"]  # its start read once, nothing else


def test_forgetting_a_lineage_has_it_worked_out_again(tmp_path: Path) -> None:
    db = _db(tmp_path)
    port = _port()
    _start(port, db)
    store = SqliteLineageStore(db)
    assert store.forget("cse_fork") == 1
    port.reads.clear()
    assert _start(port, db).get("cse_fork").fork_of == "cse_acme"
    assert "start:cse_fork" in port.reads and "start:cse_acme" not in port.reads
    assert store.forget(None) == 4
