from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from muxtower.app import create_app
from muxtower.config import load_settings
from muxtower.sources.codex.ports import Message
from muxtower.sources.codex.service import CodexSource
from muxtower.sources.codex.store import FileThreadStore
from tests.fakes import FakeTmux

THREAD = "01a17a61-6052-7b03-a8fb-6cb77c5c52fc"


class FakeAppServer:
    """The app-server's answers and pushes, shaped like the real ones."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.responses: list[tuple[int | str, dict[str, Any]]] = []

    def ensure(self) -> bool:
        return True

    def request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        self.calls.append((method, params))
        thread = {"id": THREAD, "cwd": params.get("cwd", "/srv/web"), "preview": "", "createdAt": 1793054565,
                  "status": {"type": "idle"}}  # fmt: skip
        if method == "thread/start":
            return {"thread": thread}
        if method == "thread/resume":
            turn = {"id": "t0", "status": "completed", "items": [
                {"type": "userMessage", "id": "u0", "content": [{"type": "text", "text": "earlier"}]},
                {"type": "agentMessage", "id": "a0", "text": "earlier reply"},
            ]}  # fmt: skip
            return {"thread": {**thread, "preview": "earlier", "turns": [turn]}}
        return {}

    def respond(self, request_id: int | str, result: dict[str, Any]) -> None:
        self.responses.append((request_id, result))

    def next_message(self, timeout: float) -> Message | None:
        return None

    def close(self) -> None:
        pass


def _client(tmp_path: Path, server: FakeAppServer) -> tuple[TestClient, CodexSource, dict[str, str]]:
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False},
    )  # fmt: skip
    source = CodexSource(server, FileThreadStore(tmp_path / "s" / "codex" / "threads.json"))
    app = create_app(settings, tmux=FakeTmux(), run_loops=False, codex=source)
    _, token = app.state.tokens.create("phone")
    return TestClient(app), source, {"Authorization": f"Bearer {token}"}


def test_a_headless_codex_thread_is_started_driven_approved_and_archived(tmp_path: Path) -> None:
    server = FakeAppServer()
    client, source, auth = _client(tmp_path, server)
    codex = next(r for r in client.get("/v1/runtimes", headers=auth).json() if r["name"] == "codex")
    assert codex["headless"]

    body = {"runtime": "codex", "cwd": str(tmp_path), "name": "Fix the build", "headless": True}
    started = client.post("/v1/sessions", headers=auth, json=body).json()
    assert (started["id"], started["source"], started["name"]) == (THREAD, "codex", "Fix the build")
    assert ("thread/name/set", {"threadId": THREAD, "name": "Fix the build"}) in server.calls

    client.post(f"/v1/sessions/{THREAD}/input", headers=auth, json={"text": "run the tests"})
    assert server.calls[-1] == (
        "turn/start",
        {"threadId": THREAD, "input": [{"type": "text", "text": "run the tests"}]},
    )

    for method, params, request_id in [
        ("turn/started", {"threadId": THREAD, "turn": {"id": "t1"}}, None),
        ("thread/status/changed", {"threadId": THREAD, "status": {"type": "active", "activeFlags": []}}, None),
        (
            "item/started",
            {
                "threadId": THREAD,
                "item": {"type": "commandExecution", "id": "e1", "command": "pytest -q", "status": "inProgress"},
            },
            None,
        ),  # fmt: skip
        (
            "item/commandExecution/requestApproval",
            {
                "threadId": THREAD,
                "itemId": "e1",
                "command": "pytest -q",
                "availableDecisions": ["accept", "acceptForSession", "decline"],
            },
            7,
        ),  # fmt: skip
    ]:
        source.apply(Message(method, params, request_id))
    waiting = client.get(f"/v1/sessions/{THREAD}", headers=auth).json()
    assert waiting["state"] == "needs_permission" and waiting["needs_attention"]
    assert waiting["pending"]["detail"] == "pytest -q" and waiting["pending"]["recommended"] == "accept"
    assert [o["key"] for o in waiting["pending"]["options"]] == ["accept", "acceptForSession", "decline"]

    client.post(f"/v1/sessions/{THREAD}/approve", headers=auth, json={"option": "accept"})
    assert server.responses == [(7, {"decision": "accept"})]
    for method, params in [
        (
            "item/completed",
            {
                "threadId": THREAD,
                "item": {
                    "type": "commandExecution",
                    "id": "e1",
                    "command": "pytest -q",
                    "status": "completed",
                    "exitCode": 1,
                },
            },
        ),  # fmt: skip
        ("item/completed", {"threadId": THREAD, "item": {"type": "agentMessage", "id": "a1", "text": "One fails."}}),
        ("turn/completed", {"threadId": THREAD, "turn": {"id": "t1", "status": "completed"}}),
        ("thread/status/changed", {"threadId": THREAD, "status": {"type": "idle"}}),
    ]:
        source.apply(Message(method, params))
    done = client.get(f"/v1/sessions/{THREAD}", headers=auth).json()
    assert done["state"] == "idle" and done["last_message"] == "One fails."
    items = client.get(f"/v1/sessions/{THREAD}/conversation", headers=auth).json()["items"]
    assert [(i["kind"], i.get("status")) for i in items] == [
        ("tool", "error"), ("approval", "allowed"), ("reply", None), ("result", "done")
    ]  # fmt: skip

    assert client.post(f"/v1/sessions/{THREAD}/archive", headers=auth).status_code == 204
    assert ("thread/archive", {"threadId": THREAD}) in server.calls
    (archived,) = client.get("/v1/sessions", headers=auth).json()
    assert archived["archived_at"] and archived["name"] == "Fix the build"


def test_threads_muxtower_started_are_resumed_after_a_restart(tmp_path: Path) -> None:
    store = FileThreadStore(tmp_path / "s" / "codex" / "threads.json")
    store.save([THREAD])
    server = FakeAppServer()
    client, source, auth = _client(tmp_path, server)
    assert source._connect()
    assert ("thread/resume", {"threadId": THREAD}) in server.calls
    (listed,) = client.get("/v1/sessions", headers=auth).json()
    assert listed["name"] == "earlier"  # its first message, until it is named
    items = client.get(f"/v1/sessions/{THREAD}/conversation", headers=auth).json()["items"]
    assert [i["text"] for i in items][:2] == ["earlier", "earlier reply"]


def test_an_approval_offers_what_codex_allows_without_lasting_rules() -> None:
    from muxtower.sources.codex.requests import answer, pending_action, refusal

    offered = ["accept", {"acceptWithExecpolicyAmendment": {"execpolicy_amendment": ["touch"]}}, "cancel"]
    request = Message("item/commandExecution/requestApproval", {"command": "touch x", "availableDecisions": offered}, 3)
    pending = pending_action({"3": request})
    assert pending is not None and [o.key for o in pending.options] == ["accept", "cancel"]
    assert refusal(request) == "cancel" and answer(request, None)[0] == {"decision": "cancel"}
