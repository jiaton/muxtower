"""The latest deliberate name wins: muxtower's (at launch, or a rename) over one the agent made up, a name
the owner set on the agent's side later over muxtower's, a later rename over that."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from pathlib import Path

from muxtower.infra.db import Database
from muxtower.sessions.naming import AgentName, chosen
from tests.test_recovery import _record

T0 = datetime(2026, 11, 3, 5, 0, tzinfo=UTC)
LAUNCHED = replace(_record("1:1"), name="语音输入", named=False, named_at=T0)


def test_a_name_given_at_launch_beats_one_the_agent_made_up() -> None:
    assert chosen(LAUNCHED, "notes-app-5c", AgentName("derived", T0 + timedelta(hours=1))) == ("语音输入", True)


def test_a_name_the_owner_set_on_the_agents_side_later_wins_and_a_rename_after_wins_again() -> None:
    later = AgentName("user", T0 + timedelta(hours=1))
    assert chosen(LAUNCHED, "voice notes", later) == ("voice notes", False)
    renamed = replace(LAUNCHED, name="Voice", named=True, named_at=T0 + timedelta(hours=2))
    assert chosen(renamed, "voice notes", later) == ("Voice", True)
    earlier = AgentName("user", T0 - timedelta(hours=1))  # set there before muxtower named it
    assert chosen(LAUNCHED, "voice notes", earlier) == ("语音输入", True)


def test_without_where_its_name_came_from_only_a_rename_counts() -> None:
    assert chosen(LAUNCHED, "voice notes", None) == ("voice notes", False)  # e.g. a Remote Control title
    assert chosen(LAUNCHED, None, None) == ("语音输入", False)  # nothing better: as it was started
    renamed = replace(LAUNCHED, named=True)
    assert chosen(renamed, "voice notes", None) == ("语音输入", True)


def test_a_name_set_on_the_agents_side_at_an_unknown_time_beats_a_launch_name_only() -> None:
    elsewhere = AgentName("user")  # a Remote Control title other than the one Claude Code derived
    assert chosen(LAUNCHED, "voice notes", elsewhere) == ("voice notes", False)
    assert chosen(replace(LAUNCHED, named=True), "voice notes", elsewhere) == ("语音输入", True)


def test_the_migration_keeps_explicit_renames_and_dates_launch_names(tmp_path: Path) -> None:
    db = Database(tmp_path / "m.db")
    db.migrate()
    with db.connect() as conn:
        for sid, name in (("renamed", "Muxtower Worker"), ("launched", "语音输入")):
            conn.execute(
                "INSERT INTO sessions (id, name, runtime, cwd, source, socket, tmux_session, pane_id, auto_approve,"
                " created_at, named) VALUES (?, ?, 'claude-code', '/srv', 'launched', 's', 't', '%1', 0, ?, 1)",
                (sid, name, T0.isoformat()),
            )
        conn.execute(
            "INSERT INTO audit_log (at, actor, action, session_id, detail) VALUES (?, 'phone', 'update', 'renamed',"
            ' \'{"name":"Muxtower Worker"}\')',
            ((T0 + timedelta(hours=3)).isoformat(),),
        )
        conn.execute("ALTER TABLE sessions DROP COLUMN named_at")  # as it was before
        conn.execute("DELETE FROM schema_migrations WHERE version = '024_named_at'")
    db.migrate()
    with db.connect() as conn:
        rows = {r["id"]: (r["named"], r["named_at"]) for r in conn.execute("SELECT id, named, named_at FROM sessions")}
    assert rows["renamed"] == (1, (T0 + timedelta(hours=3)).isoformat())  # the owner's rename, kept as such
    assert rows["launched"] == (0, T0.isoformat())  # named at launch only
