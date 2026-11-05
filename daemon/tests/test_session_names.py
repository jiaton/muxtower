"""Every name a session went by, offered when renaming it: each kept once (seen again: later), its past ones
read from its transcript once, taken over by a session that resumes it, never the name it has, ten at most."""

import json
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.infra.db import Database
from muxtower.sessions.models import CreateSession, UpdateSession
from muxtower.sessions.names import CLAUDE, MUXTOWER, REMOTE_CONTROL, SET_IN_CLAUDE, SessionNames, from_transcript

T0 = datetime(2026, 11, 4, 9, 0, tzinfo=UTC)


def _names(tmp_path: Path) -> SessionNames:
    db = Database(tmp_path / "n.db")
    db.migrate()
    return SessionNames(db)


def test_each_name_is_kept_once_latest_first_never_the_current_one_ten_at_most(tmp_path: Path) -> None:
    names = _names(tmp_path)
    names.note("s1", "Fix the build", CLAUDE, T0)
    names.note("s1", "Release notes", REMOTE_CONTROL, T0 + timedelta(hours=1))
    names.note("s1", "Fix the build", CLAUDE, T0 + timedelta(hours=2))  # seen again: only later
    names.note("s1", "worker", MUXTOWER, T0 + timedelta(hours=3))
    offered = names.offered("s1", "worker")
    assert [(n.name, n.source) for n in offered] == [("Fix the build", CLAUDE), ("Release notes", REMOTE_CONTROL)]
    for i in range(15):
        names.note("s1", f"name {i}", CLAUDE, T0 + timedelta(days=1, minutes=i))
    assert len(names.offered("s1", "worker")) == 10 and names.offered("s1", "worker")[0].name == "name 14"


def test_its_past_names_are_read_from_its_transcript_once(tmp_path: Path) -> None:
    transcript = tmp_path / "t.jsonl"
    lines = [
        {"type": "user", "timestamp": "2026-11-03T08:00:00Z"},
        {"type": "ai-title", "aiTitle": "Plan the migration", "sessionId": "x"},
        {"type": "assistant", "timestamp": "2026-11-03T09:00:00Z"},
        {"type": "custom-title", "customTitle": "DB migration", "sessionId": "x"},
    ]
    transcript.write_text("\n".join(json.dumps(line) for line in lines) + "\n")
    found = from_transcript(str(transcript))
    assert [(n, s, at.hour if at else None) for n, s, at in found] == [
        ("Plan the migration", CLAUDE, 8), ("DB migration", SET_IN_CLAUDE, 9),
    ]  # fmt: skip
    names = _names(tmp_path)
    names.backfill("s1", str(transcript))
    transcript.write_text("")  # read once: what it says later is seen as it happens
    names.backfill("s1", str(transcript))
    assert [n.name for n in names.offered("s1", "now")] == ["DB migration", "Plan the migration"]


def test_a_session_that_resumes_another_takes_over_its_names(tmp_path: Path) -> None:
    names = _names(tmp_path)
    names.note("old", "Plan the migration", CLAUDE, T0)
    names.inherit("old", "new")
    assert [n.name for n in names.offered("new", "x")] == ["Plan the migration"]


def test_the_route_offers_a_renamed_sessions_earlier_names(make_app: Callable[..., FastAPI], tmp_path: Path) -> None:
    app = make_app()
    client = TestClient(app)
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}
    made = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="first"))
    client.patch(f"/v1/sessions/{made.id}", json={"name": "second"}, headers=auth)
    offered = client.get(f"/v1/sessions/{made.id}/names", headers=auth).json()
    assert [(n["name"], n["source"]) for n in offered] == [("first", MUXTOWER)]  # not "second", its name now


def test_a_nodes_session_names_come_through_its_hub(make_app: Callable[..., FastAPI], tmp_path: Path) -> None:
    node = make_app(state_dir=tmp_path / "node")
    made = node.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="first"))
    node.state.sessions.update(made.id, UpdateSession(name="second"))
    answered: list[dict[str, Any]] = node.state.hub.api.handle("names", {"session_id": made.id})
    assert [n["name"] for n in answered] == ["first"]

    from muxtower.nodes.source import NodeSource

    class Link(NodeSource):
        def __init__(self) -> None:
            pass

        def _call(self, session_id: str, method: str, params: dict[str, Any] | None = None, timeout: float = 20) -> Any:
            assert method == "names"
            return answered

    (seen,) = Link().names("mac~" + made.id)
    assert (seen.name, seen.source) == ("first", MUXTOWER)
