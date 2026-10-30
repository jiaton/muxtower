"""An expired Claude login: Remote Control sessions stop updating, and the owner is told, once."""

import asyncio
import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from muxtower.app import create_app
from muxtower.config import load_settings
from muxtower.errors import LoginExpired
from muxtower.infra.bus import EventBus
from muxtower.notify.models import Subscribe
from muxtower.notify.service import PushService
from muxtower.sources.remote_control.service import RemoteControlSource
from tests.fakes import FakeTmux
from tests.rc_fakes import FakeRemoteControl
from tests.test_push import SUB, FakeSender
from tests.test_push_levels import Subscriptions


class Expiring(FakeRemoteControl):
    expired = True

    def list_sessions(self, cursor: str | None) -> tuple[list[dict[str, Any]], str | None]:
        if self.expired:
            raise LoginExpired("the Claude login on the daemon's machine is missing or expired")
        return super().list_sessions(cursor)


def test_an_expired_login_is_said_once_and_cleared_when_it_works_again() -> None:
    port = Expiring()
    source = RemoteControlSource(port, {})

    async def run() -> list[str]:
        bus, queue = EventBus(), asyncio.Queue[tuple[str, Any]]()
        bus.subscribe("claude-login:*", queue)
        loop = asyncio.create_task(source.run_loop(bus, 0.01))
        await asyncio.sleep(0.1)  # several polls, all refused
        assert source.login_expired
        port.expired = False
        await asyncio.sleep(0.1)
        loop.cancel()
        return [topic for topic, _ in [queue.get_nowait() for _ in range(queue.qsize())]]

    assert asyncio.run(run()) == ["claude-login:expired"]
    assert not source.login_expired


def test_the_owner_sees_it_on_me(tmp_path: Path) -> None:
    source = RemoteControlSource(FakeRemoteControl(), {})
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False},
    )  # fmt: skip
    app = create_app(settings, tmux=FakeTmux(), run_loops=False, remote_control=source)
    client = TestClient(app)
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}
    assert client.get("/v1/me", headers=auth).json()["claude_login_expired"] is False
    source.login_expired = True
    assert client.get("/v1/me", headers=auth).json()["claude_login_expired"] is True


def test_every_device_is_told_whatever_it_mutes() -> None:
    sender = FakeSender()
    quiet = Subscribe(**{**SUB, "done": False, "states": [], "muted": ["a"]})
    service = PushService(Subscriptions(quiet), sender, None, "nas", lambda _: True)  # type: ignore[arg-type]
    assert service.notify_login_expired() == 1
    sent = json.loads(sender.sent[-1][1])
    assert sent["kind"] == "login" and sent["session_id"] is None and "nas" in sent["body"]


def test_logging_in_again_starts_claude_auth_login_and_reads_its_link(client: TestClient, auth: dict[str, str],
                                                                     tmux: FakeTmux) -> None:  # fmt: skip
    link = "https://claude.com/cai/oauth/authorize?code=true&client_id=x&state=y"
    new_session = tmux.new_session

    def shows_link(*args: Any) -> Any:
        pane = new_session(*args)
        tmux.panes[
            (pane.socket, pane.pane_id)
        ].screen = (
            f"Opening browser to sign in…\nIf the browser didn't open, visit: {link}\nPaste code here if prompted >"
        )
        return pane

    tmux.new_session = shows_link  # type: ignore[method-assign]
    started = client.post("/v1/claude-login", headers=auth)
    assert started.status_code == 201
    body = started.json()
    assert body["url"] == link
    assert body["session"]["name"] == "Claude login" and body["session"]["cwd"] == str(Path.home())
    (pane,) = tmux.panes.values()
    assert pane.argv == ["claude", "auth", "login"]  # not an agent: none of its hooks
