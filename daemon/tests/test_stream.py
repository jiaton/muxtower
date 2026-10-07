import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from muxtower.auth.stream_cookie import COOKIE_NAME


def _token(auth: dict[str, str]) -> str:
    return auth["Authorization"].removeprefix("Bearer ")


def _expect_sessions(ws) -> None:  # type: ignore[no-untyped-def]
    ws.send_json({"type": "subscribe", "topic": "sessions"})
    assert ws.receive_json() == {"type": "sessions", "sessions": []}


def test_subprotocol_auth(client: TestClient, auth: dict[str, str]) -> None:
    with client.websocket_connect("/v1/stream", subprotocols=["muxtower", f"bearer.{_token(auth)}"]) as ws:
        assert ws.accepted_subprotocol == "muxtower"
        _expect_sessions(ws)


def test_query_token_fallback(client: TestClient, auth: dict[str, str]) -> None:
    with client.websocket_connect(f"/v1/stream?token={_token(auth)}") as ws:
        _expect_sessions(ws)


def test_rejects_without_token(client: TestClient) -> None:
    with pytest.raises(WebSocketDisconnect), client.websocket_connect("/v1/stream?token=nope") as ws:
        ws.receive_json()


def test_cookie_only_for_same_origin(client: TestClient, auth: dict[str, str]) -> None:
    res = client.post("/v1/stream/cookie", headers=auth)
    assert res.status_code == 204
    set_cookie = res.headers["set-cookie"]
    assert "HttpOnly" in set_cookie and "SameSite=strict" in set_cookie and "Path=/v1/stream" in set_cookie
    cookie = {"cookie": f"{COOKIE_NAME}={client.cookies.get(COOKIE_NAME)}"}
    client.cookies.clear()

    with client.websocket_connect("/v1/stream", headers={**cookie, "origin": "http://testserver"}) as ws:
        _expect_sessions(ws)
    with (
        pytest.raises(WebSocketDisconnect),
        client.websocket_connect("/v1/stream", headers={**cookie, "origin": "https://evil.example"}) as ws,
    ):
        ws.receive_json()


def test_cookie_dies_with_the_device(app: FastAPI, client: TestClient, auth: dict[str, str]) -> None:
    client.post("/v1/stream/cookie", headers=auth)
    cookie = {"cookie": f"{COOKIE_NAME}={client.cookies.get(COOKIE_NAME)}", "origin": "http://testserver"}
    client.cookies.clear()
    app.state.tokens.revoke("phone")
    with pytest.raises(WebSocketDisconnect), client.websocket_connect("/v1/stream", headers=cookie) as ws:
        ws.receive_json()


def test_bad_message_gets_error_frame(client: TestClient, auth: dict[str, str]) -> None:
    with client.websocket_connect(f"/v1/stream?token={_token(auth)}") as ws:
        ws.send_json({"type": "subscribe", "topic": "nope"})
        assert ws.receive_json()["type"] == "error"
