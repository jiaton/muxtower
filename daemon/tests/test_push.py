from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.notify.ports import StoredSubscription
from tests import screens
from tests.fakes import FakeTmux


class FakeSender:
    public_key = "pk"

    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []
        self.gone: set[str] = set()

    def send(self, sub: StoredSubscription, payload: str) -> bool:
        if sub.endpoint in self.gone:
            return False
        self.sent.append((sub.endpoint, payload))
        return True


SUB = {"endpoint": "https://push.example/a", "keys": {"p256dh": "k", "auth": "a"}, "client_ref": "daemon-1"}


def test_push_on_attention_respects_filters(app: FastAPI, client: TestClient, auth: dict[str, str],
                                            tmux: FakeTmux) -> None:  # fmt: skip
    sender = FakeSender()
    app.state.push.sender = sender
    assert client.post("/v1/push/subscriptions", json=SUB, headers=auth).status_code == 200
    only_plans = {**SUB, "endpoint": "https://push.example/b", "states": ["plan_review"]}
    client.post("/v1/push/subscriptions", json=only_plans, headers=auth)

    tmux.add_pane("default", "work", "claude").screen = screens.QUESTION
    result = app.state.monitor.tick()
    assert app.state.push.notify(result.attention[0]) == 1
    endpoint, payload = sender.sent[0]
    assert endpoint == "https://push.example/a" and '"client_ref":"daemon-1"' in payload


def test_gone_subscription_is_removed(app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux) -> None:
    sender = FakeSender()
    sender.gone.add(SUB["endpoint"])  # type: ignore[arg-type]
    app.state.push.sender = sender
    client.post("/v1/push/subscriptions", json=SUB, headers=auth)
    tmux.add_pane("default", "work", "claude").screen = screens.QUESTION
    app.state.push.notify(app.state.monitor.tick().attention[0])
    assert app.state.push.repo.list() == []


def test_finished_turns_notify_subscriptions_that_want_them(app: FastAPI, client: TestClient, auth: dict[str, str],
                                                           tmux: FakeTmux) -> None:  # fmt: skip
    sender = FakeSender()
    app.state.push.sender = sender
    client.post("/v1/push/subscriptions", json=SUB, headers=auth)
    quiet = {**SUB, "endpoint": "https://push.example/quiet", "done": False}
    assert client.post("/v1/push/subscriptions", json=quiet, headers=auth).json()["done"] is False

    tmux.add_pane("default", "work", "claude").screen = screens.IDLE
    app.state.monitor.tick()
    (session,) = app.state.directory.list()
    assert app.state.push.notify_done(session.id) == 1
    endpoint, payload = sender.sent[0]
    assert endpoint == SUB["endpoint"] and '"kind":"done"' in payload and '"title":"work"' in payload


def test_no_finished_push_for_a_session_someone_is_watching(app: FastAPI, client: TestClient, auth: dict[str, str],
                                                           tmux: FakeTmux) -> None:  # fmt: skip
    app.state.push.sender = FakeSender()
    client.post("/v1/push/subscriptions", json=SUB, headers=auth)
    tmux.add_pane("default", "work", "claude").screen = screens.IDLE
    app.state.monitor.tick()
    (session,) = app.state.directory.list()
    client.post(f"/v1/sessions/{session.id}/read", json={}, headers=auth)
    assert app.state.push.notify_done(session.id) == 0


def test_a_revoked_device_gets_no_more_pushes(app: FastAPI, client: TestClient, auth: dict[str, str],
                                              tmux: FakeTmux) -> None:  # fmt: skip
    sender = FakeSender()
    app.state.push.sender = sender
    _, other = app.state.tokens.create("old browser")
    client.post("/v1/push/subscriptions", json=SUB, headers=auth)
    old = {**SUB, "endpoint": "https://push.example/old"}
    client.post("/v1/push/subscriptions", json=old, headers={"Authorization": f"Bearer {other}"})
    assert client.delete("/v1/devices/old browser", headers=auth).status_code == 204

    tmux.add_pane("default", "work", "claude").screen = screens.QUESTION
    assert app.state.push.notify(app.state.monitor.tick().attention[0]) == 1
    assert [endpoint for endpoint, _ in sender.sent] == ["https://push.example/a"]
    assert [s.device for s in app.state.push.repo.list()] == ["phone"]
