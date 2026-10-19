from collections.abc import Callable

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.origins import OriginPolicy

APP_ORIGIN = "https://app.example"


def _preflight(client: TestClient, origin: str):  # type: ignore[no-untyped-def]
    return client.options(
        "/v1/me",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )


def test_any_origin_by_default(client: TestClient) -> None:
    res = _preflight(client, APP_ORIGIN)
    assert res.headers["access-control-allow-origin"] == "*"
    assert "access-control-allow-credentials" not in res.headers


def test_default_still_requires_a_token(client: TestClient) -> None:
    assert client.get("/v1/me", headers={"Origin": APP_ORIGIN}).status_code == 401


def test_listed_origin_passes_preflight(make_app: Callable[..., FastAPI]) -> None:
    client = TestClient(make_app(**{"cors.allowed_origins": [APP_ORIGIN]}))
    res = _preflight(client, APP_ORIGIN)
    assert res.headers["access-control-allow-origin"] == APP_ORIGIN
    assert "access-control-allow-credentials" not in res.headers


def test_unlisted_origin_is_refused(make_app: Callable[..., FastAPI]) -> None:
    client = TestClient(make_app(**{"cors.allowed_origins": [APP_ORIGIN]}))
    assert "access-control-allow-origin" not in _preflight(client, "https://evil.example").headers


def test_websocket_any_origin_by_default() -> None:
    assert OriginPolicy(["*"]).websocket_allowed("https://anything.example", "daemon.example")


def test_websocket_origin_policy() -> None:
    policy = OriginPolicy([APP_ORIGIN])
    assert policy.websocket_allowed(None, "daemon.example")
    assert policy.websocket_allowed(APP_ORIGIN, "daemon.example")
    assert policy.websocket_allowed("https://daemon.example", "daemon.example")
    assert not policy.websocket_allowed("https://evil.example", "daemon.example")


def test_a_gate_header_is_allowed_only_when_listed(client: TestClient, make_app: Callable[..., FastAPI]) -> None:
    def preflight(c: TestClient) -> int:
        headers = {
            "Origin": APP_ORIGIN,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization,x-gate-token",
        }
        return c.options("/v1/me", headers=headers).status_code

    assert preflight(client) == 400
    assert preflight(TestClient(make_app(**{"cors.extra_headers": ["X-Gate-Token"]}))) == 200
