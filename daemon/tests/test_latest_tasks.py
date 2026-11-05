"""A team card shows each member's last task in one request: GET /v1/tasks/latest?to=…"""

from collections.abc import Callable
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.sessions.models import CreateSession


def test_the_last_task_each_session_was_sent(make_app: Callable[..., FastAPI], tmp_path: Path) -> None:
    app = make_app()
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}
    a, b, c = (app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name=n)) for n in "abc")
    tasks = app.state.team_tasks
    tasks.send(a.id, "a", b.id, "First the spec.")
    tasks.send(a.id, "a", b.id, "Then the tests.")
    latest = TestClient(app).get(f"/v1/tasks/latest?to={b.id}&to={c.id}", headers=auth).json()
    assert list(latest) == [b.id]  # c was sent none
    assert latest[b.id]["text"].startswith("Then the tests") and latest[b.id]["from_label"].startswith("a ")
