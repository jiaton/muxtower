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
