"""Each project's colour, kept on the hub: given the first time the hub lists a project's session (the hue fewest
projects have, the lowest on a tie), never given again, changed only by the owner; a node asks its hub."""

import json
import threading
from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.chips.project_colours import HUES, ProjectColour, ProjectColourStore, least_used, project_of
from muxtower.errors import Invalid
from muxtower.infra.db import Database
from muxtower.sessions.models import CreateSession, GitPlace, Session


@pytest.fixture
def store(tmp_path: Path) -> ProjectColourStore:
    db = Database(tmp_path / "state.db")
    db.migrate()
    return ProjectColourStore(db)


def _client(app: FastAPI) -> tuple[TestClient, dict[str, str]]:
    _, token = app.state.tokens.create("phone")
    return TestClient(app), {"Authorization": f"Bearer {token}"}


def test_the_least_used_hue_lowest_on_a_tie() -> None:
    assert least_used([]) == 1
    assert least_used([1, 2, 3]) == 4
    assert least_used([1, 2, 3, 4, 5, 6]) == 1
    assert least_used([1, 1, 2, 3, 4, 5, 6]) == 2
    assert least_used([2, 2, 3]) == 1


def test_a_project_first_seen_gets_the_least_used_hue(store: ProjectColourStore) -> None:
    assert store.see(["acme/web"]) == ["acme/web"]
    assert store.see(["acme/web", "acme/api"]) == ["acme/api"]  # the one seen before keeps its own
    assert store.load().hues == {"acme/web": 1, "acme/api": 2}
    store.see(f"p{i}" for i in range(HUES))  # given one after another: 3, 4, 5, 6, then 1 and 2 again
    hues = store.load().hues
    assert sorted(hues.values()) == [1, 1, 2, 2, 3, 4, 5, 6]
    assert store.see(["acme/web"]) == []


def test_never_given_again_when_projects_come_or_go(store: ProjectColourStore) -> None:
    store.see(["acme/web", "acme/api", "acme/docs"])
    before = store.load().hues
    store.see(["acme/docs"])  # the others no longer listed: they keep theirs
    store.see(["labs/ml", "acme/web"])
    after = store.load().hues
    assert {p: after[p] for p in before} == before
    assert after["labs/ml"] == 4


def test_a_change_is_kept_and_counts(store: ProjectColourStore) -> None:
    store.see(["acme/web"])
    store.see(["acme/api"])
    store.choose(ProjectColour(project="acme/web", hue=5))
    store.see(["acme/web", "acme/docs"])
    hues = store.load().hues
    assert hues["acme/web"] == 5  # the owner's pick stays
    assert hues["acme/docs"] == 1  # 1 is free again
    store.choose(ProjectColour(project="notes", hue=3))  # one not seen yet: kept for when it comes
    assert store.see(["notes"]) == []
    assert store.load().hues["notes"] == 3


def test_an_unknown_hue_is_refused(store: ProjectColourStore) -> None:
    with pytest.raises(Invalid):
        store.choose(ProjectColour.model_construct(project="acme/web", hue=HUES + 1))
    with pytest.raises(Invalid):
        store.choose(ProjectColour.model_construct(project="acme/web", hue=0))
    assert store.load().hues == {}


def test_two_seen_at_once_take_different_hues(tmp_path: Path) -> None:
    """Two stores on one database (as two requests would be), each seeing its own new project at the same
    moment, over and over: never the same hue while one is free."""
    db = Database(tmp_path / "state.db")
    db.migrate()
    for round_ in range(20):
        with db.connect() as conn:
            conn.execute("DELETE FROM project_colours")
        stores = [ProjectColourStore(db), ProjectColourStore(db)]
        start = threading.Barrier(2)

        def see(store: ProjectColourStore, project: str, start: threading.Barrier) -> None:
            start.wait()
            store.see([project])

        threads = [threading.Thread(target=see, args=(s, f"p{round_}-{i}", start)) for i, s in enumerate(stores)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert sorted(ProjectColourStore(db).load().hues.values()) == [1, 2]


def test_one_store_seeing_from_many_threads(store: ProjectColourStore) -> None:
    start = threading.Barrier(HUES)

    def see(i: int) -> None:
        start.wait()
        store.see([f"p{i}"])

    threads = [threading.Thread(target=see, args=(i,)) for i in range(HUES)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(store.load().hues.values()) == list(range(1, HUES + 1))


def test_the_project_the_app_groups_a_session_under() -> None:
    def session(**over: object) -> Session:
        return Session.model_construct(**{"project": None, "project_source": None, "git": None, **over})

    assert project_of(session(project="acme/web", project_source="set")) == "acme/web"
    assert project_of(session(project="w", project_source="folder")) is None
    git = GitPlace(repo="/home/dev/code/shop", worktree="/home/dev/code/shop", remote="acme/shop")
    assert project_of(session(project="w", project_source="folder", git=git)) == "acme/shop"
    assert project_of(session(git=git.model_copy(update={"remote": None}))) == "shop"
    assert project_of(session()) is None


def test_the_hub_gives_a_hue_as_it_lists_a_projects_session(make_app: Callable[..., FastAPI], tmp_path: Path) -> None:
    app = make_app()
    client, auth = _client(app)
    assert client.get("/v1/project-colours", headers=auth).json() == {"hues": {}}
    made = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="api"))
    app.state.teams.set_project(made.id, "acme/api")
    assert client.get("/v1/project-colours", headers=auth).json() == {"hues": {}}  # not listed since
    assert client.get("/v1/sessions", headers=auth).status_code == 200
    assert client.get("/v1/project-colours", headers=auth).json() == {"hues": {"acme/api": 1}}


def test_a_node_gives_none_itself(make_app: Callable[..., FastAPI], tmp_path: Path) -> None:
    app = make_app()
    app.state.hub.ask = lambda method, params: {"hues": {}}
    app.state.hub.store.load = lambda: object()  # joined to a hub
    client, auth = _client(app)
    made = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="api"))
    app.state.teams.set_project(made.id, "acme/api")
    client.get("/v1/sessions", headers=auth)
    assert app.state.project_colours.load().hues == {}  # the hub gives them, as it lists this node's


def test_the_owner_picks_a_hue(make_app: Callable[..., FastAPI]) -> None:
    app = make_app()
    client, auth = _client(app)
    put = client.put("/v1/project-colours", json={"project": "acme/web", "hue": 4}, headers=auth)
    assert put.status_code == 200
    assert put.json() == {"hues": {"acme/web": 4}}
    assert client.get("/v1/project-colours", headers=auth).json() == {"hues": {"acme/web": 4}}
    with app.state.audit.db.connect() as conn:
        rows = conn.execute("SELECT detail FROM audit_log WHERE action = 'project-colour'").fetchall()
    assert [r["detail"] for r in rows] == ["acme/web=4"]


@pytest.mark.parametrize(
    "body", [{"project": "acme/web", "hue": 0}, {"project": "acme/web", "hue": 7}, {"project": " ", "hue": 1},
             {"project": "x" * 201, "hue": 1}, {"project": "acme/web"}, {"project": "acme/web", "hue": "red"}],
)  # fmt: skip
def test_a_bad_pick_is_a_422(make_app: Callable[..., FastAPI], body: dict[str, object]) -> None:
    client, auth = _client(make_app())
    assert client.put("/v1/project-colours", json=body, headers=auth).status_code == 422


def test_it_needs_a_device_token(make_app: Callable[..., FastAPI]) -> None:
    client = TestClient(make_app())
    assert client.get("/v1/project-colours").status_code == 401
    assert client.put("/v1/project-colours", json={"project": "acme/web", "hue": 1}).status_code == 401


async def test_the_hub_answers_a_nodes_project_colours(make_app: Callable[..., FastAPI]) -> None:
    from muxtower.nodes import asked

    app = make_app()
    store = app.state.project_colours
    put = {"id": 1, "method": "project_colours", "params": {"put": {"project": "acme/api", "hue": 2}}}
    reply = json.loads(await asked.answer(app.state.mcp, "mac", put, colours=store))
    assert reply["result"] == {"hues": {"acme/api": 2}}
    get = {"id": 2, "method": "project_colours", "params": {}}
    assert json.loads(await asked.answer(app.state.mcp, "mac", get, colours=store))["result"] == {
        "hues": {"acme/api": 2}
    }
    bad = {"id": 3, "method": "project_colours", "params": {"put": {"project": "acme/api", "hue": 9}}}
    assert "error" in json.loads(await asked.answer(app.state.mcp, "mac", bad, colours=store))
    assert store.load().hues == {"acme/api": 2}


async def test_a_daemon_without_the_store_says_it_does_not_answer(make_app: Callable[..., FastAPI]) -> None:
    from muxtower.nodes import asked

    app = make_app()
    reply = json.loads(await asked.answer(app.state.mcp, "mac", {"id": 1, "method": "project_colours", "params": {}}))
    assert "unknown method project_colours" in json.dumps(reply)


def test_a_node_asks_its_hub(make_app: Callable[..., FastAPI]) -> None:
    """On a node, GET and PUT go to the hub (`HubClient.ask`); the node keeps nothing itself."""
    app = make_app()
    asked: list[tuple[str, object]] = []
    on_hub = {"hues": {"acme/web": 3}}

    def ask(method: str, params: dict[str, object]) -> object:
        asked.append((method, params["put"]))
        return on_hub

    app.state.hub.ask = ask
    client, auth = _client(app)
    assert client.get("/v1/project-colours", headers=auth).json() == on_hub
    put = client.put("/v1/project-colours", json={"project": "acme/web", "hue": 3}, headers=auth)
    assert put.json() == on_hub
    assert asked == [("project_colours", None), ("project_colours", {"project": "acme/web", "hue": 3})]
    assert app.state.project_colours.load().hues == {}  # kept on the hub, not here


def test_an_older_hub_is_unavailable(make_app: Callable[..., FastAPI]) -> None:
    """A hub too old to know the method: the node says so (Unavailable, a 503: `serving.py`); the app then shows
    no colours."""
    from muxtower.errors import Unavailable

    app = make_app()

    def ask(method: str, params: dict[str, object]) -> object:
        raise Unavailable(f"the hub runs an older muxtower that does not answer {method}: update it")

    app.state.hub.ask = ask
    client, auth = _client(app)
    assert client.get("/v1/project-colours", headers=auth).status_code == 503
