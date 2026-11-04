import asyncio
import json
import os
import subprocess
import threading
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.sessions.models import CreateSession
from muxtower.teams.checkout import checkout, remote_name
from tests.fakes import FakeTmux


@contextmanager
def delivering(app: FastAPI) -> Iterator[None]:
    """The delivery loop running, as in the daemon (`TaskService.run_loop`), on a loop of its own."""
    loop = asyncio.new_event_loop()
    runs: list[asyncio.Task[None]] = []

    def run() -> None:
        asyncio.set_event_loop(loop)
        runs.append(loop.create_task(app.state.team_tasks.run_loop(app.state.bus)))
        try:
            loop.run_until_complete(runs[0])
        except asyncio.CancelledError:
            pass

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    while app.state.team_tasks._wake is None:
        time.sleep(0.01)
    try:
        yield
    finally:
        loop.call_soon_threadsafe(runs[0].cancel)
        thread.join(5)
        app.state.team_tasks._loop = app.state.team_tasks._wake = None


def until(check: Callable[[], Any], seconds: float = 5) -> Any:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if found := check():
            return found
        time.sleep(0.02)
    raise AssertionError("timed out")


def _git(cwd: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(cwd), *args], check=True, capture_output=True)  # noqa: S603, S607


def test_a_folder_is_named_after_its_remote_else_its_repository_else_itself(tmp_path: Path) -> None:
    assert remote_name("git@github.com:acme/shop.git") == remote_name("https://github.com/acme/shop") == "acme/shop"
    repo = tmp_path / "shop"
    (repo / "src").mkdir(parents=True)
    _git(repo, "init", "-q", "-b", "main")
    _git(repo, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty", "-m", "x")
    found = checkout(str(repo / "src"))
    assert (found.project, found.source, found.root, found.branch) == ("shop", "git root", str(repo), "main")
    _git(repo, "worktree", "add", "-q", "-b", "fix", str(tmp_path / "shop-fix"))
    other = checkout(str(tmp_path / "shop-fix"))
    assert (other.project, other.branch) == ("shop", "fix")  # its worktrees go with it
    _git(repo, "remote", "add", "origin", "git@github.com:acme/shop.git")
    assert checkout(str(tmp_path / "shop-fix")).project == "acme/shop"
    plain = tmp_path / "notes"
    plain.mkdir()
    assert (checkout(str(plain)).project, checkout(str(plain)).source) == ("notes", "folder")


def _rpc(client: TestClient, token: str, method: str, params: dict[str, Any] | None = None) -> Any:
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    return client.post("/v1/mcp", json=body, headers={"Authorization": f"Bearer {token}"})


def _tool(client: TestClient, token: str, tool: str, /, **arguments: Any) -> str:
    result = _rpc(client, token, "tools/call", {"name": tool, "arguments": arguments}).json()["result"]
    text: str = result["content"][0]["text"]
    return ("ERROR " if result["isError"] else "") + text


def test_sessions_muxtower_starts_reach_it_as_themselves(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app = make_app()
    client = TestClient(app)
    work = tmp_path / "shop"
    work.mkdir()
    research = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(work), name="research"))
    worker = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(work), name="worker"))
    pane = next(p for p in tmux.panes.values() if p.info.session_name == research.tmux_session)
    config = json.load(open(pane.argv[pane.argv.index("--mcp-config") + 1]))["mcpServers"]["muxtower"]
    assert (
        config["url"].endswith("/v1/mcp")
        and oct(os.stat(pane.argv[pane.argv.index("--mcp-config") + 1]).st_mode)[-3:] == "600"
    )
    token = config["headers"]["Authorization"].removeprefix("Bearer ")
    assert token.startswith(f"session.{research.id}.")

    init = _rpc(client, token, "initialize", {"protocolVersion": "2025-06-18"}).json()["result"]
    assert "my_team" in init["instructions"] and "[muxtower task from" in init["instructions"]
    assert client.get("/v1/sessions", headers={"Authorization": f"Bearer {token}"}).status_code == 401  # MCP only
    assert _rpc(client, token[:-2] + "xx", "ping").status_code == 401

    mine = _tool(client, token, "my_team")
    assert mine.startswith(f"You: {research.id} · research · no role yet") and "project shop (from its folder)" in mine
    assert f"- {worker.id} · worker · no role yet" in mine
    assert _tool(client, token, "set_role", role="research", note="discusses what to build").endswith("role research.")
    assert "role worker" in _tool(client, token, "set_role", role="worker", session_id=worker.id)
    mine = _tool(client, token, "my_team")
    assert "role: research — discusses what to build" in mine and f"{worker.id} · worker · role: worker" in mine

    assert "Project renamed to Shop for 2 sessions." == _tool(client, token, "set_project", project="Shop", rename=True)
    assert "project Shop ·" not in mine and "project Shop" in _tool(client, token, "my_team")
    _tool(client, token, "set_project", project="Elsewhere", session_id=worker.id)
    assert "nobody else yet" in _tool(client, token, "my_team")

    again = TestClient(make_app())  # kept across a restart, the session's token too
    assert "role: research — discusses what to build" in _tool(again, token, "my_team")


def test_a_device_is_no_session_and_the_concierge_keeps_its_own_mcp(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app = make_app()
    client = TestClient(app)
    _, device = app.state.tokens.create("phone")
    app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="lone"))
    team = _tool(client, device, "my_team")
    assert team.startswith("muxtower cannot tell which session you are") and "lone · no role yet" in team
    assert _tool(client, device, "set_role", role="x").startswith("ERROR whose?")
    own = app.state.sessions.create(
        CreateSession(runtime="claude", cwd=str(tmp_path), name="own", args=["--mcp-config", "/x.json"])
    )
    pane = next(p for p in tmux.panes.values() if p.info.session_name == own.tmux_session)
    assert pane.argv.count("--mcp-config") == 1


def test_codex_gets_the_same_mcp_with_its_token_from_the_environment(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app = make_app()
    started = app.state.sessions.create(CreateSession(runtime="codex", cwd=str(tmp_path), name="cx"))
    pane = next(p for p in tmux.panes.values() if p.info.session_name == started.tmux_session)
    assert any(a.startswith("mcp_servers.muxtower.url=") and a.endswith('/v1/mcp"') for a in pane.argv)
    assert 'mcp_servers.muxtower.bearer_token_env_var="MUXTOWER_MCP_TOKEN"' in pane.argv
    token = pane.env["MUXTOWER_MCP_TOKEN"]
    assert _tool(TestClient(app), token, "my_team").startswith(f"You: {started.id} · cx")


def test_a_session_on_another_machine_goes_by_its_folder_until_set() -> None:
    from datetime import UTC, datetime
    from types import SimpleNamespace

    from muxtower.runtimes.models import AgentState
    from muxtower.sessions.models import Capabilities, Session, StateSource
    from muxtower.sessions.ports import SessionSource
    from muxtower.teams.ports import Checkout, TeamRecord
    from muxtower.teams.service import TeamService

    caps = Capabilities(screen=False, conversation=True, keys=[], resize=False, terminate=False, rename=False)
    now = datetime.now(UTC)
    away = Session(
        id="mac~1", name="web", runtime="claude-code", cwd="/Users/dev/code/web", source=SessionSource.LAUNCHED,
        capabilities=caps, state=AgentState.IDLE, state_source=StateSource.HOOK, matched_rule=None,
        needs_attention=False, pending=None, last_message=None, auto_approve=False, can_auto_approve=False,
        created_at=now, updated_at=now, on_host=False, node="mac",
    )  # fmt: skip
    saved: list[TeamRecord] = []
    repo = SimpleNamespace(load=dict, save=saved.append, rename_project=lambda old, new: 0)
    reads: list[str] = []
    teams = TeamService(
        SimpleNamespace(list=lambda: [away], get=lambda _id: away),  # type: ignore[arg-type]
        repo,  # type: ignore[arg-type]
        lambda cwd: reads.append(cwd) or Checkout("x", "git root"),
    )
    (member,) = teams.members()
    assert (member.project, member.project_source, saved, reads) == ("web", "folder", [], [])  # nothing kept, no git
    teams.set_project("mac~1", "shop")
    assert teams.find("mac~1").project == "shop" and saved[-1].project == "shop" and not saved[-1].project_auto


def test_a_task_goes_to_a_role_now_or_once_the_receiver_stops_waiting(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    from muxtower.runtimes.models import AgentState
    from muxtower.sessions.live import HookState

    app = make_app()
    client = TestClient(app)
    make = app.state.sessions.create
    research = make(CreateSession(runtime="claude", cwd=str(tmp_path), name="research"))
    worker = make(CreateSession(runtime="claude", cwd=str(tmp_path), name="worker"))

    def token_of(session: Any) -> str:
        pane = next(p for p in tmux.panes.values() if p.info.session_name == session.tmux_session)
        return str(pane.env["MUXTOWER_MCP_TOKEN"])

    def sent_to(session: Any) -> list[str]:
        pane = next(p for p in tmux.panes.values() if p.info.session_name == session.tmux_session)
        return [text for kind, text in pane.sent if kind in ("text", "paste")]

    token = token_of(research)
    _tool(client, token, "set_role", role="research")
    assert "no role 'worker' in project" in _tool(client, token, "send_task", to="worker", text="x")
    _tool(client, token, "set_role", role="Worker", session_id=worker.id)
    queued = _tool(client, token, "send_task", to="worker", text="Add retries to the payment client.")
    assert queued.startswith("Queued for worker") and sent_to(worker) == []  # no loop runs: none sends
    app.state.team_tasks.deliver()
    assert len(sent_to(worker)) == 1
    with delivering(app):
        done = _tool(client, token, "send_task", to="worker", text="And its tests.")
        assert done.startswith(f"Delivered to worker (Worker, {worker.id})")
        assert sent_to(worker) == [
            f"[muxtower task from research (research) · {research.id}] Add retries to the payment client.",
            f"[muxtower task from research (research) · {research.id}] And its tests.",
        ]

        # Waiting on the owner: held, the later behind the earlier, then sent in order once it is answered.
        live = app.state.sessions.live_of(worker.id)
        live.hook, live.effective = HookState(AgentState.NEEDS_PERMISSION, at=time.monotonic()), None
        held = _tool(client, token, "send_task", to=worker.id, text="Then update the docs.")
        assert "is waiting on the owner" in held and len(sent_to(worker)) == 2
        _tool(client, token, "send_task", to=worker.id, text="Then the changelog.")
        live.hook, live.effective = None, None
        app.state.team_tasks.wake()
        until(lambda: len(sent_to(worker)) == 4)
        assert [t.split("] ", 1)[1] for t in sent_to(worker)[2:]] == ["Then update the docs.", "Then the changelog."]
    assert "recent tasks:" in _tool(client, token, "my_team") and "(delivered)" in _tool(client, token, "my_team")

    # Two sessions with the role: the sender picks one.
    other = make(CreateSession(runtime="claude", cwd=str(tmp_path), name="worker-2"))
    _tool(client, token, "set_role", role="worker", session_id=other.id)
    clash = _tool(client, token, "send_task", to="worker", text="x")
    assert clash.startswith("ERROR 2 sessions have role 'worker'") and worker.id in clash and other.id in clash
    assert _tool(client, token, "send_task", to=research.id, text="x") == "ERROR that is you"


def test_a_resumed_session_keeps_its_role_and_project(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app = make_app()
    client = TestClient(app)
    _, device = app.state.tokens.create("phone")
    agent = "4f1c2e8a-1b2c-4d3e-8f90-123456789abc"
    first = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="worker"))
    transcripts = {first.id: f"/home/dev/.claude/projects/x/{agent}.jsonl"}
    app.state.teams.transcript_of = transcripts.get
    _tool(client, device, "set_role", role="worker", session_id=first.id)
    _tool(client, device, "set_project", project="shop", session_id=first.id)
    assert _tool(client, device, "archive_session", session_id=first.id).startswith(f"Archived {first.id}")

    started = _tool(client, device, "start_session", cwd=str(tmp_path), resume=agent, name="worker again")
    assert started.endswith("Role: worker; project shop.")
    again = next(s for s in app.state.directory.list() if s.name == "worker again")
    pane = next(p for p in tmux.panes.values() if p.info.session_name == again.tmux_session)
    assert pane.argv[pane.argv.index("--resume") + 1] == agent

    # Resumed by hand (`muxtower run claude --resume …`): known once its transcript is.
    by_hand = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="by hand"))
    transcripts[by_hand.id] = f"/home/dev/.claude/projects/x/{agent}.jsonl"
    assert "role: worker" in _tool(client, device, "my_team")
    assert app.state.teams.find(by_hand.id).project == "shop"
    set_first = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="own"))
    _tool(client, device, "set_role", role="research", session_id=set_first.id)
    transcripts[set_first.id] = f"/home/dev/.claude/projects/x/{agent}.jsonl"
    assert app.state.teams.find(set_first.id).role == "research"  # given a role already: kept

    assert (
        _tool(client, device, "rename_session", session_id=by_hand.id, name="worker 2")
        == f"Renamed {by_hand.id} to worker 2."
    )
    codex = _tool(client, device, "start_session", cwd=str(tmp_path), runtime="opencode", resume=agent)
    assert codex.startswith("ERROR opencode sessions cannot be resumed")


async def test_a_node_may_ask_its_hub_for_team_and_reach_tools_only(make_app: Callable[..., FastAPI]) -> None:
    from muxtower.nodes import asked

    tools = make_app().state.mcp
    reply = json.loads(
        await asked.answer(tools, "mac", {"id": 1, "method": "team_tool", "params": {"tool": "start_session"}})
    )
    assert reply["error"]["status"] == 400 and "no team tool" in reply["error"]["message"]
    reply = json.loads(await asked.answer(tools, "mac", {"id": 2, "method": "approve", "params": {}}))
    assert reply["error"]["status"] == 400
    reply = json.loads(
        await asked.answer(
            tools, "mac", {"id": 3, "method": "team_tool", "params": {"tool": "my_team", "session_id": "x1"}}
        )
    )
    assert reply["result"]["text"].startswith("muxtower cannot tell which session you are")  # mac~x1 is not listed


def test_the_owner_sets_roles_from_the_app_and_reads_the_tasks(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app = make_app()
    client = TestClient(app)
    _, device = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {device}"}
    a = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="a"))
    b = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="b"))
    set_a = client.put(f"/v1/sessions/{a.id}/team", json={"role": "research", "note": "talks it through"}, headers=auth)
    assert (set_a.json()["team_role"], set_a.json()["team_note"]) == ("research", "talks it through")
    client.put(f"/v1/sessions/{b.id}/team", json={"role": "worker", "project": "shop"}, headers=auth)
    listed = {s["id"]: s for s in client.get("/v1/sessions", headers=auth).json()}
    assert (listed[b.id]["team_role"], listed[b.id]["project"]) == ("worker", "shop")
    kept = client.put(f"/v1/sessions/{a.id}/team", json={"project": "shop"}, headers=auth).json()
    assert kept["team_note"] == "talks it through"  # only what is given changes
    pane = next(p for p in tmux.panes.values() if p.info.session_name == a.tmux_session)
    _tool(client, pane.env["MUXTOWER_MCP_TOKEN"], "send_task", to="worker", text="Build it.")
    app.state.team_tasks.deliver()  # what the delivery loop does
    (task,) = client.get(f"/v1/sessions/{b.id}/tasks", headers=auth).json()
    assert (task["from_id"], task["to_id"], task["text"], task["status"]) == (a.id, b.id, "Build it.", "delivered")
    assert client.get(f"/v1/sessions/{a.id}/tasks", headers=auth).json()[0]["id"] == task["id"]  # sent ones too


def test_every_place_a_folder_can_be_in_git(tmp_path: Path) -> None:
    """One repository whatever folder of it a session runs in: its main folder, a subfolder, a worktree inside
    or outside it; a submodule is its own; folders outside git and unknown ones are just folders."""
    git = ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "protocol.file.allow=always"]
    lib = tmp_path / "lib"
    lib.mkdir()
    _git(lib, "init", "-q", "-b", "main")
    _git(lib, *git, "commit", "-q", "--allow-empty", "-m", "x")
    shop = tmp_path / "shop"
    (shop / "src").mkdir(parents=True)
    _git(shop, "init", "-q", "-b", "main")
    _git(shop, "remote", "add", "origin", "https://github.com/acme/shop.git")
    _git(shop, *git, "commit", "-q", "--allow-empty", "-m", "x")
    _git(shop, "worktree", "add", "-q", "-b", "inside", str(shop / ".worktrees" / "inside"))
    _git(shop, "worktree", "add", "-q", "-b", "teams", str(tmp_path / "shop-teams"))
    _git(shop, *git, "submodule", "add", "-q", str(lib), "vendor/lib")
    (tmp_path / "notes").mkdir()

    def where(folder: Path) -> tuple[str | None, str | None, str | None, str]:
        found = checkout(str(folder))
        return found.repo, found.root, found.branch, found.project

    assert where(shop) == (str(shop), str(shop), "main", "acme/shop")
    assert where(shop / "src") == (str(shop), str(shop), "main", "acme/shop")  # a subfolder: the repository
    assert where(shop / ".worktrees" / "inside") == (
        str(shop),
        str(shop / ".worktrees" / "inside"),
        "inside",
        "acme/shop",
    )
    assert where(tmp_path / "shop-teams") == (str(shop), str(tmp_path / "shop-teams"), "teams", "acme/shop")
    sub = where(shop / "vendor" / "lib")  # the innermost repository
    assert sub[0] == sub[1] == str(shop / "vendor" / "lib") and sub[3].endswith("lib")  # its own origin
    assert where(tmp_path / "notes") == (None, None, None, "notes")
    assert where(tmp_path / "gone") == (None, None, None, "gone")


def test_sessions_say_where_they_sit_in_git_and_the_project_my_team_says(
    make_app: Callable[..., FastAPI], tmp_path: Path
) -> None:
    shop = tmp_path / "shop"
    shop.mkdir()
    _git(shop, "init", "-q", "-b", "main")
    _git(shop, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty", "-m", "x")
    _git(shop, "worktree", "add", "-q", "-b", "fix", str(tmp_path / "shop-fix"))
    app = make_app()
    client = TestClient(app)
    _, device = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {device}"}
    main = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(shop), name="main"))
    fix = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path / "shop-fix"), name="fix"))
    plain = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="plain"))
    from muxtower.teams.placing import place_new

    assert place_new(app.state.teams) == 3  # as soon as they are listed, not only when a tool asks
    assert place_new(app.state.teams) == 0  # kept: worked out once
    listed = {s["id"]: s for s in client.get("/v1/sessions", headers=auth).json()}
    assert listed[main.id]["git"] == {"repo": str(shop), "worktree": str(shop), "branch": "main", "remote": None}
    assert listed[fix.id]["git"]["repo"] == str(shop) and listed[fix.id]["git"]["branch"] == "fix"
    assert listed[plain.id]["git"] is None
    assert (listed[main.id]["project"], listed[main.id]["project_auto"]) == ("shop", True)  # as my_team says
    assert (listed[main.id]["project_source"], listed[fix.id]["project"]) == ("git root", "shop")
    assert listed[plain.id]["project_source"] == "folder"  # placed by its folder in the lists
    team = _tool(client, device, "my_team")
    assert "shop" in team
    client.put(f"/v1/sessions/{fix.id}/team", json={"project": "Payments"}, headers=auth)
    assert (
        next(s for s in client.get("/v1/sessions", headers=auth).json() if s["id"] == fix.id)["project"] == "Payments"
    )
    moved = next(s for s in client.get("/v1/sessions", headers=auth).json() if s["id"] == fix.id)
    assert (moved["project_auto"], moved["project_source"]) == (False, "set")


def test_one_loop_sends_each_task_once_and_goes_on_after_a_restart(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Sending over Remote Control takes a while; when the request thread sent too, a retry woken
    meanwhile found the task still held and sent it again. Now only the delivery loop sends."""
    app = make_app()
    research = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="research"))
    worker = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="worker"))
    tasks = app.state.team_tasks
    directory = app.state.directory
    real = directory.send_input
    sent: list[str] = []

    def slow(session_id: str, body: Any) -> None:
        sent.append(body.text)
        time.sleep(0.3)  # an HTTP call to Remote Control
        real(session_id, body)

    monkeypatch.setattr(directory, "send_input", slow)
    with delivering(app):
        sender = threading.Thread(target=tasks.send, args=(research.id, "research", worker.id, "Build it."))
        sender.start()
        for _ in range(5):  # changes of state wake it again and again meanwhile
            time.sleep(0.03)
            tasks.wake()
        sender.join()
        until(lambda: tasks.recent([worker.id]).get(worker.id, [None])[0].status == "delivered")
        assert [t.split("] ", 1)[1] for t in sent] == ["Build it."]

        # A send that fails stays held for the next round.
        def failing(session_id: str, body: Any) -> None:
            raise RuntimeError("Remote Control went away")

        monkeypatch.setattr(directory, "send_input", failing)
        assert tasks.send(research.id, "research", worker.id, "Then the docs.")[2] == "failed"
        assert [t.text for t in tasks.repo.held()] == ["Then the docs."]

    # Stopped with it held: the daemon starts again, and its loop sends it.
    monkeypatch.setattr(directory, "send_input", slow)
    from muxtower.teams.tasks import TaskService

    app.state.team_tasks = TaskService(app.state.teams, directory, tasks.repo)
    with delivering(app):
        until(lambda: tasks.repo.held() == [])
    assert [t.split("] ", 1)[1] for t in sent] == ["Build it.", "Then the docs."]
