import json
import os
import subprocess
from collections.abc import Callable
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.sessions.models import CreateSession
from muxtower.teams.checkout import checkout, remote_name
from tests.fakes import FakeTmux


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


def _tool(client: TestClient, token: str, name: str, **arguments: Any) -> str:
    result = _rpc(client, token, "tools/call", {"name": name, "arguments": arguments}).json()["result"]
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
    import time

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
    done = _tool(client, token, "send_task", to="worker", text="Add retries to the payment client.")
    assert done.startswith(f"Delivered to worker (Worker, {worker.id})")
    assert sent_to(worker) == [
        f"[muxtower task from research (research) · {research.id}] Add retries to the payment client."
    ]

    # Waiting on the owner: held, then sent once the prompt is answered.
    live = app.state.sessions.live_of(worker.id)
    live.hook, live.effective = HookState(AgentState.NEEDS_PERMISSION, at=time.monotonic()), None
    held = _tool(client, token, "send_task", to=worker.id, text="Then update the docs.")
    assert "is waiting on the owner" in held and len(sent_to(worker)) == 1
    app.state.team_tasks.retry()
    assert len(sent_to(worker)) == 1  # still waiting
    live.hook, live.effective = None, None
    app.state.team_tasks.retry()
    assert sent_to(worker)[-1].endswith("] Then update the docs.")
    assert "recent tasks:" in _tool(client, token, "my_team") and "(delivered)" in _tool(client, token, "my_team")

    # Two sessions with the role: the sender picks one.
    other = make(CreateSession(runtime="claude", cwd=str(tmp_path), name="worker-2"))
    _tool(client, token, "set_role", role="worker", session_id=other.id)
    clash = _tool(client, token, "send_task", to="worker", text="x")
    assert clash.startswith("ERROR 2 sessions have role 'worker'") and worker.id in clash and other.id in clash
    assert _tool(client, token, "send_task", to=research.id, text="x") == "ERROR that is you"
