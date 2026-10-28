"""Codex threads of the app-server Codex's own clients share: listed, driven and approved from muxtower."""

import time
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from muxtower.app import create_app
from muxtower.config import load_settings
from muxtower.errors import Conflict
from muxtower.sources.codex.ports import Message
from muxtower.sources.codex.shared import SharedCodexSource
from tests.fakes import FakeTmux

TUI = "01a18200-0000-7000-8000-00000000000a"
DESKTOP = "01a18200-0000-7000-8000-00000000000b"
STALE = "01a18200-0000-7000-8000-00000000000c"
FRESH = "01a18200-0000-7000-8000-00000000000d"  # loaded, but no rollout yet: it cannot be joined
HELPER = "01a18200-0000-7000-8000-00000000000e"


def thread(thread_id: str, **fields: Any) -> dict[str, Any]:
    now = int(time.time())
    return {
        "id": thread_id, "cwd": "/srv/web", "preview": "fix the build", "createdAt": now - 60, "updatedAt": now - 5,
        "status": {"type": "idle"}, "originator": "codex-tui", "source": "vscode", "ephemeral": False, **fields,
    }  # fmt: skip


class FakeShared:
    """The shared app-server: some loaded threads, and what is asked of it."""

    def __init__(self) -> None:
        self.loaded = {TUI: thread(TUI), DESKTOP: thread(DESKTOP, originator="Codex Desktop", cwd="/Users/me/web"),
                       STALE: thread(STALE, updatedAt=int(time.time()) - 5 * 3600),
                       HELPER: thread(HELPER, parentThreadId=TUI)}  # fmt: skip
        self.up = True
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.responses: list[tuple[int | str, dict[str, Any]]] = []

    def ensure(self) -> bool:
        return self.up

    def request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        self.calls.append((method, params))
        if method == "thread/loaded/list":
            return {"data": [*self.loaded, FRESH], "nextCursor": None}
        if method == "thread/resume":
            found = self.loaded.get(params["threadId"])
            if found is None:
                raise Conflict("no rollout found for thread id")
            turn = {"id": "t0", "status": "completed", "items": [
                {"type": "userMessage", "id": "u0", "content": [{"type": "text", "text": "earlier"}]},
                {"type": "agentMessage", "id": "a0", "text": "earlier reply"},
            ]}  # fmt: skip
            return {"thread": {**found, "turns": [turn]}}
        return {}

    def respond(self, request_id: int | str, result: dict[str, Any]) -> None:
        self.responses.append((request_id, result))

    def next_message(self, timeout: float) -> Message | None:
        return None

    def close(self) -> None:
        pass


def _client(tmp_path: Path, server: FakeShared) -> tuple[TestClient, SharedCodexSource, dict[str, str]]:
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False},
    )  # fmt: skip
    source = SharedCodexSource(server)
    app = create_app(settings, tmux=FakeTmux(), run_loops=False, codex_shared=source)
    _, token = app.state.tokens.create("phone")
    return TestClient(app), source, {"Authorization": f"Bearer {token}"}


def test_the_threads_of_codex_clients_are_listed_with_where_they_run(tmp_path: Path) -> None:
    server = FakeShared()
    client, source, auth = _client(tmp_path, server)
    assert source._connect() and source.refresh()
    listed = {s["id"]: s for s in client.get("/v1/sessions", headers=auth).json()}
    assert set(listed) == {TUI, DESKTOP}  # not the stale one, the sub-agent, nor the one without a rollout yet
    assert (listed[TUI]["source"], listed[TUI]["origin"], listed[DESKTOP]["origin"]) == (
        "codex_shared", "codex_cli", "codex_desktop")  # fmt: skip
    assert listed[TUI]["capabilities"]["archive"] is False and listed[TUI]["capabilities"]["conversation"]
    items = client.get(f"/v1/sessions/{TUI}/conversation", headers=auth).json()["items"]
    assert [(i["kind"], i["text"]) for i in items][:2] == [("prompt", "earlier"), ("reply", "earlier reply")]
    # it is only joined once, and the one that could not be is not asked again at once
    server.calls.clear()
    source._looked = 0.0
    assert not source.refresh()
    assert [m for m, _ in server.calls].count("thread/resume") == 0


def test_a_thread_that_leaves_the_app_server_leaves_the_list(tmp_path: Path) -> None:
    server = FakeShared()
    client, source, auth = _client(tmp_path, server)
    source._connect()
    source.refresh()
    del server.loaded[DESKTOP]
    source._looked = 0.0
    assert source.refresh()
    assert [s["id"] for s in client.get("/v1/sessions", headers=auth).json()] == [TUI]


def test_a_request_made_after_joining_is_answered_from_here(tmp_path: Path) -> None:
    server = FakeShared()
    client, source, auth = _client(tmp_path, server)
    source._connect()
    source.refresh()
    request = Message("item/commandExecution/requestApproval", {"threadId": TUI, "itemId": "e1", "command": "make"}, 9)
    source.apply(
        Message(
            "thread/status/changed",
            {"threadId": TUI, "status": {"type": "active", "activeFlags": ["waitingOnApproval"]}},
        )
    )
    source.apply(request)  # fmt: skip
    waiting = client.get(f"/v1/sessions/{TUI}", headers=auth).json()
    assert waiting["state"] == "needs_permission" and waiting["pending"]["detail"] == "make"
    assert client.post(f"/v1/sessions/{TUI}/approve", headers=auth, json={"option": "accept"}).status_code == 200
    assert server.responses == [(9, {"decision": "accept"})]
    client.post(f"/v1/sessions/{TUI}/input", headers=auth, json={"text": "go on"})
    assert server.calls[-1] == ("turn/start", {"threadId": TUI, "input": [{"type": "text", "text": "go on"}]})


def test_a_request_made_before_joining_is_only_flagged_and_cannot_be_answered(tmp_path: Path) -> None:
    server = FakeShared()
    server.loaded[TUI]["status"] = {"type": "active", "activeFlags": ["waitingOnApproval"]}
    client, source, auth = _client(tmp_path, server)
    source._connect()
    source.refresh()
    waiting = client.get(f"/v1/sessions/{TUI}", headers=auth).json()
    assert waiting["state"] == "needs_permission" and waiting["needs_attention"]
    assert "where it runs" in waiting["pending"]["detail"] and waiting["pending"]["options"] == []
    res = client.post(f"/v1/sessions/{TUI}/approve", headers=auth, json={})
    assert res.status_code == 409 and "where it runs" in res.json()["detail"]
    assert server.responses == []


def test_a_waiting_status_nobody_touched_for_long_is_a_terminal_that_went_away(tmp_path: Path) -> None:
    server = FakeShared()
    server.loaded[TUI]["status"] = {"type": "active", "activeFlags": ["waitingOnApproval"]}
    server.loaded[TUI]["updatedAt"] = int(time.time()) - 3600
    client, source, auth = _client(tmp_path, server)
    source._connect()
    source.refresh()
    assert client.get(f"/v1/sessions/{TUI}", headers=auth).json()["state"] == "idle"


def test_archiving_a_session_never_touches_codexs_own_history(tmp_path: Path) -> None:
    server = FakeShared()
    client, source, auth = _client(tmp_path, server)
    source._connect()
    source.refresh()
    source.archive(TUI)
    assert not [m for m, _ in server.calls if m == "thread/archive"]


def test_it_waits_for_codex_to_run_a_shared_app_server(tmp_path: Path) -> None:
    server = FakeShared()
    server.up = False
    client, source, auth = _client(tmp_path, server)
    assert not source._connect() and client.get("/v1/sessions", headers=auth).json() == []
    server.up = True
    assert source._connect() and source.refresh()
    assert len(client.get("/v1/sessions", headers=auth).json()) == 2


def test_a_codex_pane_that_is_a_shared_thread_is_listed_once_with_what_the_thread_heard(tmp_path: Path) -> None:
    import dataclasses

    from muxtower.sessions.monitor import Monitor
    from tests import screens
    from tests.test_linking import FakeProcesses

    tmux = FakeTmux()
    pane = tmux.add_pane("default", "work", "codex")
    pane.info = dataclasses.replace(pane.info, pid=4242)
    pane.screen = screens.CODEX_COMMAND
    server = FakeShared()
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False},
    )  # fmt: skip
    source = SharedCodexSource(server)
    app = create_app(settings, tmux=tmux, run_loops=False, codex_shared=source)
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}
    client = TestClient(app)
    source._connect()
    source.refresh()
    request = Message("item/commandExecution/requestApproval", {"threadId": TUI, "itemId": "e1", "command": "make"}, 9)
    source.apply(request)
    Monitor(app.state.sessions, FakeProcesses({4242: TUI})).tick()

    listed = client.get("/v1/sessions", headers=auth).json()
    assert sorted(s["id"] for s in listed) == sorted(
        [DESKTOP, next(s["id"] for s in listed if s["source"] == "adopted")]
    )
    mine = next(s for s in listed if s["source"] == "adopted")
    assert (mine["remote_id"], mine["name"], mine["origin"]) == (TUI, "fix the build", "codex_cli")
    assert mine["state"] == "needs_permission" and mine["state_source"] == "screen"
    assert mine["pending"]["detail"] == "make"  # the pane's dialog has only its choices; the thread heard the command
    assert [o["key"] for o in mine["pending"]["options"]] == ["1", "2", "3"]  # approved with the pane's keys
    # a message goes through the app-server, structured; keys stay with the terminal
    client.post(f"/v1/sessions/{mine['id']}/input", headers=auth, json={"text": "go on", "enter": True})
    assert server.calls[-1] == ("turn/start", {"threadId": TUI, "input": [{"type": "text", "text": "go on"}]})
    assert pane.sent == []


def test_after_the_app_server_restarts_the_threads_are_joined_again(tmp_path: Path) -> None:
    from muxtower.errors import Unavailable

    server = FakeShared()
    client, source, auth = _client(tmp_path, server)
    source._connect()
    source.refresh()
    assert len(client.get("/v1/sessions", headers=auth).json()) == 2
    request = server.request

    def gone(method: str, params: dict[str, Any]) -> dict[str, Any]:
        raise Unavailable("codex app-server is not running")

    server.request = gone  # type: ignore[method-assign]
    source._looked = 0.0
    try:
        source.refresh()
    except Unavailable:
        source._connected = False  # what the loop does
    server.request = request  # type: ignore[method-assign]
    del server.loaded[DESKTOP]  # and it came back with fewer threads
    assert source._connect()
    assert client.get("/v1/sessions", headers=auth).json() == []  # nothing is believed of the old connection
    assert source.refresh()
    assert [s["id"] for s in client.get("/v1/sessions", headers=auth).json()] == [TUI]


def test_a_thread_heard_of_is_joined_at_once_even_when_it_failed_a_moment_ago(tmp_path: Path) -> None:
    server = FakeShared()
    client, source, auth = _client(tmp_path, server)
    source._connect()
    source.refresh()
    assert FRESH not in {s["id"] for s in client.get("/v1/sessions", headers=auth).json()}  # no rollout yet
    server.loaded[FRESH] = thread(FRESH, preview="a new one")  # its first message was sent: the rollout exists
    assert not source.refresh()  # nothing heard, and a look was just taken
    source.apply(Message("thread/status/changed", {"threadId": FRESH, "status": {"type": "active", "activeFlags": []}}))
    assert source.refresh()  # heard of: joined now, not after the backoff
    assert FRESH in {s["id"] for s in client.get("/v1/sessions", headers=auth).json()}


def test_a_file_change_approval_names_the_file_its_item_changes(tmp_path: Path) -> None:
    server = FakeShared()
    client, source, auth = _client(tmp_path, server)
    source._connect()
    source.refresh()
    patch = {"type": "fileChange", "id": "f1", "status": "inProgress", "changes": [{"path": "/srv/web/a.txt"}]}
    source.apply(Message("item/started", {"threadId": TUI, "item": patch}))
    source.apply(Message("item/fileChange/requestApproval", {"threadId": TUI, "itemId": "f1"}, 4))
    pending = client.get(f"/v1/sessions/{TUI}", headers=auth).json()["pending"]
    assert (pending["tool_name"], pending["detail"]) == ("apply_patch", "/srv/web/a.txt")


def test_one_thread_that_answers_slowly_does_not_cost_the_others_their_place(tmp_path: Path) -> None:
    from muxtower.errors import Unavailable

    server = FakeShared()
    client, source, auth = _client(tmp_path, server)
    request = server.request

    def slow(method: str, params: dict[str, Any]) -> dict[str, Any]:
        if method == "thread/resume" and params["threadId"] == DESKTOP:
            raise Unavailable("codex app-server did not answer thread/resume")
        return request(method, params)

    server.request = slow  # type: ignore[method-assign]
    source._connect()
    assert source.refresh()  # the one joined is listed, the slow one is tried again later
    assert [s["id"] for s in client.get("/v1/sessions", headers=auth).json()] == [TUI]
    assert source._connected  # and the connection is not thought lost


def test_what_was_heard_is_kept_when_the_app_server_is_away_for_a_moment(tmp_path: Path) -> None:
    from muxtower.errors import Unavailable

    server = FakeShared()
    client, source, auth = _client(tmp_path, server)
    source._connect()
    source.apply(Message("thread/started", {"thread": {"id": DESKTOP}}))
    request = server.request

    def gone(method: str, params: dict[str, Any]) -> dict[str, Any]:
        raise Unavailable("codex app-server is not running")

    server.request = gone  # type: ignore[method-assign]
    try:
        source.refresh()
    except Unavailable:
        pass
    server.request = request  # type: ignore[method-assign]
    assert source.due()  # still to be looked at, at once


def test_a_connection_that_never_said_hello_is_not_gone_on_with(tmp_path: Path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    from muxtower.errors import Unavailable
    from muxtower.sources.codex.adapter import SharedAppServer

    class Socket:
        closed = False

        def close(self) -> None:
            self.closed = True

    server = SharedAppServer(tmp_path / "app-server-control.sock")
    opened = Socket()
    monkeypatch.setattr(server, "_start", lambda: setattr(server, "_ws", opened))

    def refused(method: str, params: dict[str, Any]) -> dict[str, Any]:
        raise Unavailable("codex app-server did not answer initialize")

    monkeypatch.setattr(server, "request", refused)
    assert not server.ensure()
    assert server._ws is None and opened.closed  # the next ensure() connects and greets again
