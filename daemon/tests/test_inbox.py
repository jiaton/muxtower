"""The owner's Inbox on the hub: items listed in the owner's order, edits refused on a stale version (409 with
the item as it is now), done items kept 30 days as history, a hand-off as one team task to a role's holder or a
session, each project's default hand-off role (following a rename) and who an item can go to. A node asks its
hub. Made-up data only."""

import json
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.sessions.models import CreateSession


def _client(app: FastAPI) -> tuple[TestClient, dict[str, str]]:
    _, token = app.state.tokens.create("phone")
    return TestClient(app), {"Authorization": f"Bearer {token}"}


def _session(app: FastAPI, tmp_path: Path, name: str, project: str, role: str | None = None) -> str:
    made = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name=name))
    app.state.teams.set_project(made.id, project)
    if role:
        app.state.teams.set_role(made.id, role, None)
    return str(made.id)


def test_add_list_order_edit_and_delete(make_app: Callable[..., FastAPI]) -> None:
    client, auth = _client(make_app())
    assert client.get("/v1/inbox", headers=auth).json() == {"items": [], "done": []}
    first = client.post("/v1/inbox", json={"text": "Try a dark theme"}, headers=auth)
    assert first.status_code == 201
    item = first.json()
    assert item["status"] == "open" and item["version"] == 1 and item["project"] is None
    assert item["due"] is None and item["due_state"] == "none" and item["on_due"] == "remind"
    second = client.post("/v1/inbox", json={"text": "Plan the launch", "project": "acme/shop"}, headers=auth).json()
    listed = client.get("/v1/inbox", headers=auth).json()["items"]
    assert [i["id"] for i in listed] == [second["id"], item["id"]]  # the newest first

    ordered = client.put("/v1/inbox/order", json={"ids": [item["id"]]}, headers=auth).json()["items"]
    assert [i["id"] for i in ordered] == [item["id"], second["id"]]  # the others after the named, as they were

    v = client.get("/v1/inbox", headers=auth).json()["items"][0]["version"]
    changed = client.patch(f"/v1/inbox/{item['id']}", json={"text": "Try a light theme", "if_version": v}, headers=auth)
    assert changed.status_code == 200 and changed.json()["text"] == "Try a light theme"
    assert changed.json()["version"] == v + 1
    assert ordered[1]["version"] == second["version"] + 1  # a reorder is a change too
    moved = client.patch(
        f"/v1/inbox/{second['id']}", json={"project": None, "if_version": ordered[1]["version"]}, headers=auth
    ).json()
    assert moved["project"] is None and moved["text"] == "Plan the launch"  # what is left out stays
    assert (
        client.patch(f"/v1/inbox/{item['id']}", json={"status": "handed", "if_version": 9}, headers=auth).status_code
        == 422
    )

    assert client.delete(f"/v1/inbox/{item['id']}", headers=auth).status_code == 204
    assert client.delete(f"/v1/inbox/{item['id']}", headers=auth).status_code == 404
    assert [i["id"] for i in client.get("/v1/inbox", headers=auth).json()["items"]] == [second["id"]]
    assert client.post("/v1/inbox", json={"text": "   "}, headers=auth).status_code == 422
    assert TestClient(make_app()).get("/v1/inbox").status_code == 401


def test_a_stale_version_is_refused_with_the_item_as_it_is_now(make_app: Callable[..., FastAPI]) -> None:
    """The concierge read version 1; the owner edited since: its edit changes nothing, and it gets the owner's."""
    client, auth = _client(make_app())
    item = client.post("/v1/inbox", json={"text": "Write the changelog"}, headers=auth).json()
    owner = client.patch(
        f"/v1/inbox/{item['id']}", json={"text": "Write the release notes", "if_version": 1}, headers=auth
    )
    assert owner.status_code == 200
    late = client.patch(f"/v1/inbox/{item['id']}", json={"text": "Changelog, short", "if_version": 1}, headers=auth)
    assert late.status_code == 409
    body = late.json()
    assert body["current"]["text"] == "Write the release notes" and body["current"]["version"] == 2
    assert "changed since version 1" in body["detail"]


def test_done_items_leave_the_list_and_are_kept_thirty_days(make_app: Callable[..., FastAPI]) -> None:
    app = make_app()
    client, auth = _client(app)
    old = client.post("/v1/inbox", json={"text": "Old idea"}, headers=auth).json()
    new = client.post("/v1/inbox", json={"text": "New idea"}, headers=auth).json()
    for item in (old, new):
        done = client.patch(f"/v1/inbox/{item['id']}", json={"status": "done", "if_version": 1}, headers=auth)
        assert done.json()["status"] == "done" and done.json()["done_at"]
    assert client.get("/v1/inbox", headers=auth).json() == {"items": [], "done": []}  # not returned by default
    assert [i["id"] for i in client.get("/v1/inbox?done=1", headers=auth).json()["done"]] == [new["id"], old["id"]]

    long_ago = (datetime.now(UTC) - timedelta(days=31)).isoformat()
    with app.state.inbox.db.connect() as conn:
        conn.execute("UPDATE inbox_items SET done_at = ? WHERE id = ?", (long_ago, old["id"]))
    assert [i["id"] for i in client.get("/v1/inbox?done=1", headers=auth).json()["done"]] == [new["id"]]
    with app.state.inbox.db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM inbox_items WHERE id = ?", (old["id"],)).fetchone()[0] == 0

    back = client.patch(f"/v1/inbox/{new['id']}", json={"status": "open", "if_version": 2}, headers=auth).json()
    assert back["status"] == "open" and back["done_at"] is None


def _task(app: FastAPI, task_id: int) -> Any:
    return next(t for t in app.state.team_tasks.repo.held() if t.id == task_id)


def test_hand_to_a_role_or_a_session(make_app: Callable[..., FastAPI], tmp_path: Path) -> None:
    app = make_app()
    client, auth = _client(app)
    reviewer = _session(app, tmp_path, "rev", "acme/shop", "Reviewer")
    builder = _session(app, tmp_path, "builder", "acme/shop", "builder")
    _session(app, tmp_path, "elsewhere", "acme/web", "reviewer")
    item = client.post("/v1/inbox", json={"text": "Check the refund flow"}, headers=auth).json()

    handed = client.post(
        f"/v1/inbox/{item['id']}/hand", json={"project": "ACME/shop", "role": "reviewer"}, headers=auth
    )
    assert handed.status_code == 200
    h = handed.json()
    assert h["status"] == "handed" and h["handed"]["to_session"] == reviewer and h["handed"]["to_role"] == "Reviewer"
    task = _task(app, h["handed"]["task_id"])
    assert task.to_id == reviewer and task.text == "Check the refund flow" and task.from_label == "the owner's Inbox"
    assert task.from_id is None

    other = client.post("/v1/inbox", json={"text": "Tidy the build"}, headers=auth).json()
    to_session = client.post(
        f"/v1/inbox/{other['id']}/hand", json={"project": "acme/shop", "session_id": builder}, headers=auth
    ).json()
    assert to_session["handed"]["to_session"] == builder and to_session["handed"]["to_role"] is None
    assert _task(app, to_session["handed"]["task_id"]).to_id == builder

    with app.state.audit.db.connect() as conn:
        rows = conn.execute("SELECT detail, session_id FROM audit_log WHERE action = 'inbox-hand'").fetchall()
    assert len(rows) == 2 and all("refund" not in (r["detail"] or "") for r in rows)  # no text audited


def test_hand_to_a_role_no_one_holds_is_409(make_app: Callable[..., FastAPI], tmp_path: Path) -> None:
    app = make_app()
    client, auth = _client(app)
    _session(app, tmp_path, "rev", "acme/shop", "reviewer")
    item = client.post("/v1/inbox", json={"text": "Write the docs"}, headers=auth).json()
    nobody = client.post(f"/v1/inbox/{item['id']}/hand", json={"project": "acme/shop", "role": "writer"}, headers=auth)
    assert nobody.status_code == 409 and nobody.json()["detail"] == "no one in acme/shop holds writer"
    gone = client.post(
        f"/v1/inbox/{item['id']}/hand", json={"project": "acme/shop", "session_id": "nope"}, headers=auth
    )
    assert gone.status_code == 409
    both = {"project": "acme/shop", "role": "reviewer", "session_id": "x"}
    assert client.post(f"/v1/inbox/{item['id']}/hand", json=both, headers=auth).status_code == 422
    assert client.post(f"/v1/inbox/{item['id']}/hand", json={"project": "acme/shop"}, headers=auth).status_code == 422
    assert client.get("/v1/inbox", headers=auth).json()["items"][0]["status"] == "open"
    assert app.state.team_tasks.repo.held() == []


def test_default_role_and_targets(make_app: Callable[..., FastAPI], tmp_path: Path) -> None:
    app = make_app()
    client, auth = _client(app)
    empty = client.get("/v1/projects/acme/empty/handoff-targets", headers=auth).json()
    assert empty == {"project": "acme/empty", "default_role": None, "roles": [], "sessions": []}
    a = _session(app, tmp_path, "a", "acme/shop", "builder")
    _session(app, tmp_path, "b", "acme/shop", "builder")
    _session(app, tmp_path, "c", "acme/shop", "reviewer")
    _session(app, tmp_path, "d", "acme/shop")
    assert client.get("/v1/projects/acme/shop/handoff", headers=auth).json() == {"role": None}
    put = client.put("/v1/projects/acme/shop/handoff", json={"role": " reviewer "}, headers=auth)
    assert put.json() == {"role": "reviewer"}
    targets = client.get("/v1/projects/acme/shop/handoff-targets", headers=auth).json()
    assert targets["default_role"] == "reviewer"
    assert targets["roles"] == [{"role": "builder", "sessions": 2}, {"role": "reviewer", "sessions": 1}]
    assert [s["name"] for s in targets["sessions"]] == ["a", "b", "c", "d"]
    assert targets["sessions"][0] == {"id": a, "name": "a", "role": "builder"}
    assert client.put("/v1/projects/acme/shop/handoff", json={"role": None}, headers=auth).json() == {"role": None}


def test_the_default_role_and_items_follow_a_project_rename(make_app: Callable[..., FastAPI], tmp_path: Path) -> None:
    app = make_app()
    client, auth = _client(app)
    lead = _session(app, tmp_path, "lead", "acme/shop", "builder")
    _session(app, tmp_path, "web", "acme/web")
    client.put("/v1/projects/acme/shop/handoff", json={"role": "builder"}, headers=auth)
    client.put("/v1/projects/acme/web/handoff", json={"role": "designer"}, headers=auth)
    target = {"project": "acme/shop", "role": "builder"}
    item = client.post(
        "/v1/inbox", json={"text": "Ship it", "project": "acme/shop", "due": "2030-01-02", "due_has_time": False,
                           "on_due": "hand_off", "due_target": target}, headers=auth,
    ).json()  # fmt: skip
    renamed = client.put(
        f"/v1/sessions/{lead}/team", json={"project": "acme/store", "rename_project": True}, headers=auth
    )
    assert renamed.status_code == 200
    assert client.get("/v1/projects/acme/store/handoff", headers=auth).json() == {"role": "builder"}
    assert client.get("/v1/projects/acme/shop/handoff", headers=auth).json() == {"role": None}
    now = client.get("/v1/inbox", headers=auth).json()["items"][0]
    assert now["project"] == "acme/store" and now["due_target"]["project"] == "acme/store"
    assert now["version"] > item["version"]

    # Merged into a project that has a default role already: that one's stays.
    merged = client.put(f"/v1/sessions/{lead}/team", json={"project": "acme/web", "rename_project": True}, headers=auth)
    assert merged.status_code == 200
    assert client.get("/v1/projects/acme/web/handoff", headers=auth).json() == {"role": "designer"}


async def test_the_hub_answers_a_nodes_inbox(make_app: Callable[..., FastAPI]) -> None:
    from muxtower.nodes import asked

    app = make_app()
    add = {"id": 1, "method": "inbox", "params": {"op": "add", "body": {"text": "From the laptop"}}}
    reply = json.loads(await asked.answer(app.state.mcp, "mac", add, inbox=app.state.inbox))
    assert reply["result"]["text"] == "From the laptop"
    got = json.loads(await asked.answer(app.state.mcp, "mac", {"id": 2, "method": "inbox", "params": {"op": "list"}},
                                        inbox=app.state.inbox))  # fmt: skip
    assert [i["text"] for i in got["result"]["items"]] == ["From the laptop"]
    stale = {"op": "patch", "id": reply["result"]["id"], "body": {"text": "x", "if_version": 7}}
    answered = json.loads(await asked.answer(app.state.mcp, "mac", {"id": 3, "method": "inbox", "params": stale},
                                             inbox=app.state.inbox))  # fmt: skip
    assert answered["result"]["stale"]["current"]["text"] == "From the laptop"
    none = json.loads(await asked.answer(app.state.mcp, "mac", {"id": 4, "method": "inbox", "params": {"op": "list"}}))
    assert "unknown method inbox" in json.dumps(none)


def test_a_node_asks_its_hub(make_app: Callable[..., FastAPI]) -> None:
    """On a node, every Inbox call goes to the hub (`HubClient.ask`); a stale edit's 409 comes back the same."""
    app = make_app()
    asked: list[tuple[str, dict[str, Any]]] = []
    now = datetime.now(UTC).isoformat()
    on_hub = {"id": 5, "text": "On the hub", "project": None, "status": "open", "created_at": now, "updated_at": now,
              "order": 0, "version": 3}  # fmt: skip

    def ask(method: str, params: dict[str, Any], *_: Any) -> Any:
        asked.append((method, params))
        if params["op"] == "list":
            return {"items": [on_hub], "done": []}
        return {"stale": {"detail": "changed", "current": on_hub}}

    app.state.hub.ask = ask
    client, auth = _client(app)
    assert client.get("/v1/inbox", headers=auth).json()["items"][0]["text"] == "On the hub"
    late = client.patch("/v1/inbox/5", json={"text": "x", "if_version": 1}, headers=auth)
    assert late.status_code == 409 and late.json()["current"]["version"] == 3
    assert [(m, p["op"]) for m, p in asked] == [("inbox", "list"), ("inbox", "patch")]
    assert asked[1][1]["body"] == {"text": "x", "if_version": 1}  # only what was given
    with app.state.inbox.db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM inbox_items").fetchone()[0] == 0  # the node keeps nothing
