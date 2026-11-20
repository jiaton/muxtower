"""The owner's order of projects in the list grouped by project, kept on the hub: what is put is what is read
back, each project once, within the limits; a node asks its hub."""

import json
from collections.abc import Callable

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.chips.project_order import MAX_ORDERED
from muxtower.chips.service import MAX_PROJECT_NAME


def _client(app: FastAPI) -> tuple[TestClient, dict[str, str]]:
    _, token = app.state.tokens.create("phone")
    return TestClient(app), {"Authorization": f"Bearer {token}"}


def test_what_is_put_is_read_back_in_its_order(make_app: Callable[..., FastAPI]) -> None:
    client, auth = _client(make_app())
    assert client.get("/v1/project-order", headers=auth).json() == {"projects": []}
    twice = ["acme/web", "acme/api", "acme/web", "notes"]
    put = client.put("/v1/project-order", json={"projects": twice}, headers=auth)
    assert put.status_code == 200
    assert put.json() == {"projects": ["acme/web", "acme/api", "notes"]}  # each once, at its first place
    assert client.get("/v1/project-order", headers=auth).json() == {"projects": ["acme/web", "acme/api", "notes"]}
    moved = client.put("/v1/project-order", json={"projects": ["notes", "acme/web"]}, headers=auth)
    assert moved.json() == {"projects": ["notes", "acme/web"]}  # replaced whole
    assert client.get("/v1/project-order", headers=auth).json() == {"projects": ["notes", "acme/web"]}


def test_the_limits(make_app: Callable[..., FastAPI]) -> None:
    client, auth = _client(make_app())

    def put(projects: list[str]) -> int:
        return client.put("/v1/project-order", json={"projects": projects}, headers=auth).status_code

    assert put([f"p{i}" for i in range(MAX_ORDERED)]) == 200
    assert put([f"p{i}" for i in range(MAX_ORDERED + 1)]) == 422
    assert put(["x" * MAX_PROJECT_NAME]) == 200
    assert put(["x" * (MAX_PROJECT_NAME + 1)]) == 422
    assert put(["  "]) == 422


def test_it_needs_a_device_token(make_app: Callable[..., FastAPI]) -> None:
    client = TestClient(make_app())
    assert client.get("/v1/project-order").status_code == 401
    assert client.put("/v1/project-order", json={"projects": []}).status_code == 401


async def test_the_hub_answers_a_nodes_project_order(make_app: Callable[..., FastAPI]) -> None:
    from muxtower.nodes import asked

    app = make_app()
    store = app.state.project_order
    put = {"id": 1, "method": "project_order", "params": {"put": {"projects": ["acme/api", "acme/web"]}}}
    reply = json.loads(await asked.answer(app.state.mcp, "mac", put, order=store))
    assert reply["result"] == {"projects": ["acme/api", "acme/web"]}
    assert store.load().projects == ["acme/api", "acme/web"]
    get = {"id": 2, "method": "project_order", "params": {}}
    got = json.loads(await asked.answer(app.state.mcp, "mac", get, order=store))
    assert got["result"] == {"projects": ["acme/api", "acme/web"]}
    bad = {"id": 3, "method": "project_order", "params": {"put": {"projects": [" "]}}}
    assert "error" in json.loads(await asked.answer(app.state.mcp, "mac", bad, order=store))


async def test_a_daemon_without_the_store_says_it_does_not_answer(make_app: Callable[..., FastAPI]) -> None:
    from muxtower.nodes import asked

    app = make_app()
    reply = json.loads(await asked.answer(app.state.mcp, "mac", {"id": 1, "method": "project_order", "params": {}}))
    assert "unknown method project_order" in json.dumps(reply)


def test_a_node_asks_its_hub(make_app: Callable[..., FastAPI]) -> None:
    """On a node, GET and PUT go to the hub (`HubClient.ask`); the node keeps nothing itself."""
    app = make_app()
    asked: list[tuple[str, object]] = []
    on_hub = {"projects": ["acme/web"]}

    def ask(method: str, params: dict[str, object]) -> object:
        asked.append((method, params["put"]))
        return on_hub if params["put"] is None else params["put"]

    app.state.hub.ask = ask
    client, auth = _client(app)
    assert client.get("/v1/project-order", headers=auth).json() == on_hub
    put = client.put("/v1/project-order", json={"projects": ["acme/api"]}, headers=auth)
    assert put.json() == {"projects": ["acme/api"]}
    assert asked == [("project_order", None), ("project_order", {"projects": ["acme/api"]})]
    assert app.state.project_order.load().projects == []  # kept on the hub, not here
