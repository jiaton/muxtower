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


def test_a_projects_activity_is_its_tasks_and_messages_from_or_to_its_members(
    make_app: Callable[..., FastAPI], tmp_path: Path
) -> None:
    app = make_app()
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}
    pm, dev, other = (
        app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name=n))
        for n in ("pm", "dev", "x")
    )
    teams = app.state.teams
    for session, project in ((pm, "acme/web"), (dev, "acme/web"), (other, "acme/api")):
        teams.set_project(session.id, project)
    tasks = app.state.team_tasks
    tasks.send(pm.id, "pm", dev.id, "Build the chart.")
    tasks.send(dev.id, "dev", other.id, "Which endpoint has the totals?")  # to another project: kept
    third = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="y"))
    teams.set_project(third.id, "acme/api")
    tasks.send(other.id, "x", third.id, "Elsewhere.")  # nothing to do with acme/web
    app.state.audit.record(f"session {pm.id}", "mcp:send_message", dev.id)
    app.state.audit.record(f"session {other.id}", "mcp:send_message", third.id)
    seen = TestClient(app).get("/v1/projects/acme%2Fweb/activity", headers=auth).json()
    assert sorted(seen["members"]) == sorted([pm.id, dev.id])
    assert [t["text"][:16] for t in seen["tasks"]] == ["Build the chart.", "Which endpoint h"]  # oldest first
    assert [(m["from_id"], m["to_id"]) for m in seen["messages"]] == [(pm.id, dev.id)]
