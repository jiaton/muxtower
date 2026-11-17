"""The owner's team playbook: one shared, a project adding to it or replacing it, every save a version (409
when another came since), a revert saving an old one again; read by sessions at the top of my_team and in
full with read_playbook; a node's requests answered by its hub."""

import asyncio
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.nodes import asked
from muxtower.playbook.service import INLINE
from muxtower.sessions.models import CreateSession
from tests.fakes import FakeTmux


def _device(app: FastAPI) -> tuple[TestClient, dict[str, str]]:
    _, token = app.state.tokens.create("phone")
    return TestClient(app), {"Authorization": f"Bearer {token}"}


def _put(client: TestClient, auth: dict[str, str], scope: str, text: str, base: int, mode: str = "add") -> Any:
    return client.put(f"/v1/playbook/{scope}", json={"text": text, "mode": mode, "base_version": base}, headers=auth)


def test_versions_a_stale_edit_and_a_revert(make_app: Callable[..., FastAPI]) -> None:
    client, auth = _device(make_app())
    empty = client.get("/v1/playbook", headers=auth).json()
    assert empty["shared"]["version"] == 0 and empty["shared"]["text"] == "" and empty["projects"] == []  # ships empty

    assert _put(client, auth, "shared", "- Report once, then go on.", 0).json()["version"] == 1
    assert _put(client, auth, "shared", "- Report once, then go on.\n- Ask before spending.", 1).json()["version"] == 2
    stale = _put(client, auth, "shared", "an edit started from v1", 1)
    assert stale.status_code == 409 and "changed since" in stale.json()["detail"]  # never overwrites another's

    versions = client.get("/v1/playbook/shared/versions", headers=auth).json()
    assert [v["version"] for v in versions] == [2, 1] and versions[0]["author"] == "phone"
    reverted = client.post("/v1/playbook/shared/revert", json={"version": 1}, headers=auth).json()
    assert reverted["version"] == 3 and reverted["text"] == "- Report once, then go on."  # a new version
    assert client.get("/v1/playbook/shared/versions", headers=auth).json()[0]["note"] == "reverted to v1"
    assert client.put("/v1/playbook/elsewhere", json={"text": "x", "base_version": 0}, headers=auth).status_code == 400


def test_a_project_adds_to_the_shared_playbook_or_replaces_it(make_app: Callable[..., FastAPI]) -> None:
    client, auth = _device(make_app())
    _put(client, auth, "shared", "- shared habit", 0)
    _put(client, auth, "projects/acme/web", "- run make check", 0)
    _put(client, auth, "projects/acme/api", "- only this", 0, mode="replace")

    def effective(project: str) -> list[tuple[str, str]]:
        found = client.get("/v1/playbook", params={"effective_for": project}, headers=auth).json()["effective"]
        return [(p["scope"], p["text"]) for p in found]

    assert effective("acme/web") == [("shared", "- shared habit"), ("projects/acme/web", "- run make check")]
    assert effective("acme/api") == [("projects/acme/api", "- only this")]
    assert effective("other") == [("shared", "- shared habit")]
    listed = client.get("/v1/playbook", headers=auth).json()["projects"]
    assert [(p["scope"], p["mode"]) for p in listed] == [("projects/acme/api", "replace"), ("projects/acme/web", "add")]


def test_sessions_read_it_at_the_top_of_my_team_and_in_full(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app = make_app()
    client, auth = _device(app)
    work = tmp_path / "web"
    work.mkdir()
    made = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(work), name="worker"))
    pane = next(p for p in tmux.panes.values() if p.info.session_name == made.tmux_session)
    config = json.load(open(pane.argv[pane.argv.index("--mcp-config") + 1]))["mcpServers"]["muxtower"]
    token = config["headers"]["Authorization"].removeprefix("Bearer ")

    def tool(name: str, **arguments: Any) -> str:
        body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": arguments}}
        result = client.post("/v1/mcp", json=body, headers={"Authorization": f"Bearer {token}"}).json()["result"]
        return str(result["content"][0]["text"])

    assert tool("my_team").startswith("You: ")  # none written: nothing about it
    assert "no team playbook" in tool("read_playbook")
    project = app.state.directory.get(made.id).project
    _put(client, auth, "shared", "- Report once, then go on.", 0)
    _put(client, auth, f"projects/{project}", "- Screenshots for UI changes.", 0)
    top = tool("my_team")
    assert top.startswith("Team playbook (the owner's")
    assert "— shared (v1) —\n- Report once, then go on." in top
    assert f"— {project} adds (v1) —\n- Screenshots for UI changes." in top
    assert top.index("Team playbook") < top.index("You: ")

    long = "\n".join(f"- habit number {i}: always do the thing the owner asked, carefully." for i in range(60))
    _put(client, auth, "shared", long, 1)
    top = tool("my_team")
    head = top[: top.index("You: ")]
    assert len(head) < INLINE + 100 and "more lines: read_playbook for all of it" in head
    full = tool("read_playbook")
    assert "habit number 59" in full and "habit number 59" not in head

    init = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}}
    said = client.post("/v1/mcp", json=init, headers={"Authorization": f"Bearer {token}"}).json()["result"]
    assert "team playbook" in said["instructions"]


def test_a_node_s_request_is_answered_by_its_hub(make_app: Callable[..., FastAPI]) -> None:
    app = make_app()

    def ask(params: dict[str, Any]) -> Any:
        frame = {"id": 1, "method": "playbook", "params": params}
        reply = asyncio.run(asked.answer(app.state.mcp, "mac", frame, app.state.chip_groups, app.state.playbook))
        return json.loads(reply)

    put = ask({"op": "put", "scope": "shared", "body": {"text": "- from the mac", "base_version": 0}})
    assert put["result"]["version"] == 1 and put["result"]["author"] == "a device through mac"
    got = ask({"op": "get", "effective_for": "x"})["result"]
    assert got["effective"][0]["text"] == "- from the mac"
