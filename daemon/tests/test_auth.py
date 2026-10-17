from fastapi import FastAPI
from fastapi.testclient import TestClient


def test_health_is_public(client: TestClient) -> None:
    res = client.get("/v1/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_me_requires_token(client: TestClient) -> None:
    res = client.get("/v1/me")
    assert res.status_code == 401 and res.headers["x-muxtower-auth"] == "invalid-credentials"
    assert client.get("/v1/me", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_me_accepts_device_token(app: FastAPI, client: TestClient) -> None:
    _, token = app.state.tokens.create("phone")
    res = client.get("/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["token_name"] == "phone"


def test_revoked_token_is_rejected(app: FastAPI, client: TestClient) -> None:
    _, token = app.state.tokens.create("phone")
    app.state.tokens.revoke("phone")
    assert client.get("/v1/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
