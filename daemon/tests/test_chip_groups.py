"""The owner's groups of projects (the app's second chip row), kept on the hub in their order: what is put is
what is read back, within the limits; a node asks its hub."""

import json
from collections.abc import Callable

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.chips.service import MAX_GROUPS, MAX_NAME, MAX_PROJECTS, MAX_SESSIONS, OTHER


def _client(app: FastAPI) -> tuple[TestClient, dict[str, str]]:
    _, token = app.state.tokens.create("phone")
    return TestClient(app), {"Authorization": f"Bearer {token}"}


def test_what_is_put_is_read_back_in_its_order(make_app: Callable[..., FastAPI]) -> None:
    client, auth = _client(make_app())
    assert client.get("/v1/chip-groups", headers=auth).json() == {"groups": []}
    groups = [
        {"id": "g2", "name": " Focus ", "projects": ["muxtower", "ha", "ha"], "sessions": ["mac~ab12", "ab34", "ab34"]},
        {"id": "g1", "name": "Rest", "projects": [OTHER]},  # as an app before single sessions puts it
    ]
    put = client.put("/v1/chip-groups", json={"groups": groups}, headers=auth)
    assert put.status_code == 200
    expected = [
        {"id": "g2", "name": "Focus", "projects": ["muxtower", "ha"], "sessions": ["mac~ab12", "ab34"]},  # each once
        {"id": "g1", "name": "Rest", "projects": [OTHER], "sessions": []},
    ]
    assert put.json()["groups"] == expected and client.get("/v1/chip-groups", headers=auth).json()["groups"] == expected
    assert client.put("/v1/chip-groups", json={"groups": []}, headers=auth).json() == {"groups": []}  # replaced


def test_the_limits(make_app: Callable[..., FastAPI]) -> None:
    client, auth = _client(make_app())

    def put(groups: list[dict[str, object]]) -> int:
        return client.put("/v1/chip-groups", json={"groups": groups}, headers=auth).status_code

    one = {"id": "a", "name": "A", "projects": ["x"]}
    assert put([{**one, "id": f"g{i}"} for i in range(MAX_GROUPS)]) == 200
    assert put([{**one, "id": f"g{i}"} for i in range(MAX_GROUPS + 1)]) == 422
    assert put([{**one, "projects": [f"p{i}" for i in range(MAX_PROJECTS + 1)]}]) == 422
    assert put([{**one, "name": "n" * (MAX_NAME + 1)}]) == 422
    assert put([{**one, "sessions": [f"s{i}" for i in range(MAX_SESSIONS)]}]) == 200
    assert put([{**one, "sessions": [f"s{i}" for i in range(MAX_SESSIONS + 1)]}]) == 422
    assert put([{**one, "name": "   "}]) == 422
    assert put([one, one]) == 422  # two with one id
    assert put([{**one, "id": "has space"}]) == 422


async def test_the_hub_answers_a_nodes_chip_groups(make_app: Callable[..., FastAPI]) -> None:
    from muxtower.nodes import asked

    app = make_app()
    store = app.state.chip_groups
    frame = {
        "id": 1,
        "method": "chip_groups",
        "params": {"put": {"groups": [{"id": "f", "name": "F", "projects": []}]}},
    }
    reply = json.loads(await asked.answer(app.state.mcp, "mac", frame, store))
    assert reply["result"]["groups"][0]["name"] == "F" and store.load().groups[0].id == "f"
    reply = json.loads(
        await asked.answer(app.state.mcp, "mac", {"id": 2, "method": "chip_groups", "params": {}}, store)
    )
    assert reply["result"]["groups"][0]["id"] == "f"
