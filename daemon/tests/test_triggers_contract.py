"""Triggers v1 contract: kept, edited and fired by secret (the pipeline itself is T1's)."""

from fastapi.testclient import TestClient

SPEC = {"name": "deal-watch", "action": {"kind": "deliver", "to": "buyer@deals"}, "rate_per_hour": 3}


def test_a_trigger_is_kept_its_secret_shown_once_and_only_it_fires_it(client: TestClient, auth: dict[str, str]) -> None:
    made = client.post("/v1/triggers", headers=auth, json=SPEC)
    assert made.status_code == 201
    trigger, secret = made.json()["trigger"], made.json()["secret"]
    assert trigger["name"] == "deal-watch" and trigger["enabled"] is True and "secret" not in trigger
    assert client.post("/v1/triggers", headers=auth, json=SPEC).status_code == 409  # the name is taken
    assert [t["id"] for t in client.get("/v1/triggers", headers=auth).json()] == [trigger["id"]]

    url = f"/v1/triggers/{trigger['id']}/fire"
    assert client.post(url, json={"price": 9}).status_code == 404  # no secret
    assert client.post(url, json={"price": 9}, headers=auth).status_code == 404  # a device token does not fire it
    assert client.post(url, json={}, headers={"X-Muxtower-Trigger-Secret": "wrong"}).status_code == 404
    fired = client.post(url, json={"price": 9}, headers={"X-Muxtower-Trigger-Secret": secret})
    assert fired.status_code == 200 and fired.json()["via"] == "webhook"
    assert client.post(f"{url}/{secret}?key=k1", content=b"plain text").json()["key"] == "k1"
    assert (
        client.post(url, content=b"x" * (64 * 1024 + 1), headers={"X-Muxtower-Trigger-Secret": secret}).status_code
        == 400
    )

    new = client.post(f"/v1/triggers/{trigger['id']}/secret", headers=auth).json()["secret"]
    assert client.post(url, json={}, headers={"X-Muxtower-Trigger-Secret": secret}).status_code == 404  # rotated
    assert client.post(url, json={}, headers={"X-Muxtower-Trigger-Secret": new}).status_code == 200

    paused = client.patch(f"/v1/triggers/{trigger['id']}", headers=auth, json={"enabled": False, "clear_rate": True})
    assert paused.json()["enabled"] is False and paused.json()["rate_per_hour"] is None
    log = client.get(f"/v1/triggers/{trigger['id']}/firings", headers=auth).json()
    assert len(log) == 3 and log[0]["id"] > log[-1]["id"]  # newest first
    by_name = client.post("/v1/triggers/fire-by-name", headers=auth, json={"name": "deal-watch", "payload": {"a": 1}})
    assert by_name.json()["via"] == "cli"
    assert client.post("/v1/triggers/fire-by-name", json={"name": "deal-watch"}).status_code == 401  # a device's
    assert client.delete(f"/v1/triggers/{trigger['id']}", headers=auth).status_code == 204
    assert client.get("/v1/triggers", headers=auth).json() == []


def test_no_migration_comment_holds_a_semicolon() -> None:
    # Migrations run statement by statement, split at ";": one in a comment cut a statement in two.
    from pathlib import Path

    import muxtower.infra.migrations as migrations

    for sql in sorted(Path(migrations.__file__).parent.glob("*.sql")):
        for n, line in enumerate(sql.read_text().splitlines(), 1):
            comment = line.split("--", 1)[1] if "--" in line else ""
            assert ";" not in comment, f"{sql.name}:{n}: a ';' in a comment"
