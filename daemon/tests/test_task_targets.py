"""Whom `send_task` reaches: a session id; `role@project` (split at the last @, regardless of case); else a
role of the sender's own project. What it cannot find, it says: the projects there are, or the roles."""

from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi import FastAPI

from muxtower.errors import Conflict, NotFound
from muxtower.sessions.models import CreateSession


def _team(make_app: Callable[..., FastAPI], tmp_path: Path) -> tuple[FastAPI, dict[str, str]]:
    app = make_app()
    ids = {}
    for name, role, project in (
        ("me", "worker", "Shop"), ("rev", "reviewer", "Shop"), ("docs", "writer", "Site"),
        ("ops1", "ops", "Site"), ("ops2", "ops", "Site"), ("mail", "a@b", "Shop"),
    ):  # fmt: skip
        s = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name=name))
        app.state.teams.set_role(s.id, role, None)
        app.state.teams.set_project(s.id, project)
        ids[name] = s.id
    return app, ids


def test_role_at_project_reaches_another_project_regardless_of_case(
    make_app: Callable[..., FastAPI], tmp_path: Path
) -> None:
    app, ids = _team(make_app, tmp_path)
    tasks, me = app.state.team_tasks, app.state.teams.member(app.state.directory.get(ids["me"]))
    assert tasks.receiver("WRITER@site", me).session.id == ids["docs"]  # another project
    assert tasks.receiver("reviewer", me).session.id == ids["rev"]  # own project, as before
    assert tasks.receiver(ids["docs"], me).session.id == ids["docs"]  # an id: anywhere
    assert tasks.receiver("writer@Site", None).session.id == ids["docs"]  # a device: the project it names


def test_it_says_what_there_is_when_it_cannot_tell(make_app: Callable[..., FastAPI], tmp_path: Path) -> None:
    app, ids = _team(make_app, tmp_path)
    tasks, me = app.state.team_tasks, app.state.teams.member(app.state.directory.get(ids["me"]))
    with pytest.raises(Conflict, match="2 sessions have role 'ops' in project Site"):
        tasks.receiver("ops@site", me)
    with pytest.raises(NotFound, match="roles there: ops, writer"):
        tasks.receiver("tester@Site", me)
    with pytest.raises(NotFound, match="no project 'Mars': projects are Shop, Site"):
        tasks.receiver("writer@Mars", me)


def test_a_role_with_an_at_in_it_is_still_a_role_of_ones_own_project(
    make_app: Callable[..., FastAPI], tmp_path: Path
) -> None:
    app, ids = _team(make_app, tmp_path)
    tasks, me = app.state.team_tasks, app.state.teams.member(app.state.directory.get(ids["me"]))
    assert tasks.receiver("a@b", me).session.id == ids["mail"]  # "b" is no project: the whole is the role
    assert tasks.receiver("a@b@shop", me).session.id == ids["mail"]  # split at the last @
