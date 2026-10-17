from collections.abc import Callable

from fastapi import FastAPI
from fastapi.testclient import TestClient


def test_code_is_single_use_and_mints_own_token(client: TestClient, auth: dict[str, str]) -> None:
    assert client.post("/v1/pair/codes").status_code == 401
    code = client.post("/v1/pair/codes", headers=auth).json()["code"]

    first = client.post("/v1/pair/claim", json={"code": code.lower(), "device_name": "laptop"})
    assert first.status_code == 200
    token = first.json()["token"]
    assert first.json()["device_name"] == "laptop"
    assert client.get("/v1/me", headers={"Authorization": f"Bearer {token}"}).json()["token_name"] == "laptop"

    again = client.post("/v1/pair/claim", json={"code": code, "device_name": "thief"})
    assert again.status_code == 401  # a wrong code is a failed credential: counted by fail2ban


def test_device_names_are_made_unique(client: TestClient, auth: dict[str, str]) -> None:
    names = []
    for _ in range(2):
        code = client.post("/v1/pair/codes", headers=auth).json()["code"]
        names.append(client.post("/v1/pair/claim", json={"code": code, "device_name": "phone"}).json()["device_name"])
    assert names == ["phone-2", "phone-3"]  # "phone" is the fixture's token


def test_list_and_revoke_devices(client: TestClient, auth: dict[str, str]) -> None:
    devices = client.get("/v1/devices", headers=auth).json()
    assert [(d["name"], d["current"]) for d in devices] == [("phone", True)]
    assert client.delete("/v1/devices/phone", headers=auth).status_code == 204
    assert client.get("/v1/devices", headers=auth).status_code == 401


def test_claims_are_rate_limited(client: TestClient) -> None:
    codes = [
        client.post("/v1/pair/claim", json={"code": "WRONG-CODE", "device_name": "x"}).status_code for _ in range(12)
    ]
    assert codes[:10] == [401] * 10 and codes[-1] == 429


def test_shared_mode_hands_out_the_shared_token(make_app: Callable[..., FastAPI]) -> None:
    app = make_app(**{"pairing.mode": "shared", "pairing.shared_token": "shared-secret"})
    client = TestClient(app)
    auth = {"Authorization": "Bearer shared-secret"}
    code = client.post("/v1/pair/codes", headers=auth).json()["code"]
    claimed = client.post("/v1/pair/claim", json={"code": code, "device_name": "phone"}).json()
    assert claimed["token"] == "shared-secret"


def test_rate_limit_uses_the_client_behind_trusted_proxies(make_app: Callable[..., FastAPI]) -> None:
    # TestClient connects from "testclient"; trust it like a reverse proxy on the same host.
    from muxtower.net import ClientAddress

    addr = ClientAddress(["172.16.0.0/12"])

    class Conn:
        def __init__(self, peer: str, xff: str) -> None:
            self.client = type("C", (), {"host": peer})()
            self.headers = {"x-forwarded-for": xff}

    assert addr.of(Conn("172.19.0.3", "203.0.113.9, 172.19.0.2")) == "203.0.113.9"  # type: ignore[arg-type]
    assert addr.of(Conn("198.51.100.7", "203.0.113.9")) == "198.51.100.7"  # type: ignore[arg-type]
