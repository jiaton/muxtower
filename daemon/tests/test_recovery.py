"""Sessions a restart interrupted: told apart from those that ended (never dropped when that is not sure),
kept with what starts them again, and started again, under their own id, only as the owner says."""

import time
from collections.abc import Callable
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.config import RecoverySettings
from muxtower.runtimes.models import AgentState
from muxtower.runtimes.spec import load_runtimes
from muxtower.sessions.interrupted import gone, launch_options
from muxtower.sessions.live import HookState
from muxtower.sessions.models import CreateSession
from muxtower.sessions.ports import SessionRecord, SessionSource
from muxtower.terminal.ports import PaneRef
from tests.fakes import FakeTmux

SOCKET = "muxtower"
AGENT = "4f1c2e8a-1b2c-4d3e-8f90-123456789abc"


def test_its_options_are_kept_and_never_its_prompt() -> None:
    runtimes = load_runtimes(None)
    claude, codex = runtimes["claude-code"].config, runtimes["codex"].config
    args = ["--model", "opus", "--permission-mode", "plan", "--verbose", "Fix the build", "--resume", "old"]
    assert launch_options(args, claude) == ["--model", "opus", "--permission-mode", "plan", "--verbose"]
    assert launch_options(["--resume=old", "--add-dir", "/srv/x", "hi"], claude) == ["--add-dir", "/srv/x"]
    assert launch_options(["-c", "model=o3", "resume", "abc", "go on"], codex) == ["-c", "model=o3"]


def _record(server: str | None) -> SessionRecord:
    return SessionRecord(
        id="s1", name="w", runtime="claude-code", cwd="/srv", source=SessionSource.LAUNCHED,
        pane=PaneRef(SOCKET, "%1"), tmux_session="mxt-s1", hook_token_hash=None, auto_approve=False,
        created_at=__import__("datetime").datetime.now(), server_id=server,
    )  # fmt: skip


def test_gone_is_ended_only_when_its_own_server_is_known_to_have_closed_it() -> None:
    assert gone(_record("1:10"), "1:10", None) == "ended"  # the same server runs on: its pane closed
    assert gone(_record("1:10"), "2:20", None) == "interrupted"  # another server: a restart
    assert gone(_record("1:10"), None, None) == "interrupted"  # none, and never seen this run: a restart
    assert gone(_record("1:10"), None, "1:10") == "ended"  # seen this run: its last pane took it along
    assert gone(_record("1:10"), None, "3:30") == "interrupted"
    assert gone(_record(None), "1:10", "1:10") == "interrupted"  # where it ran is not known: kept


def _start(app: FastAPI, tmux: FakeTmux, tmp_path: Path, name: str, *args: str) -> tuple[str, str]:
    made = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name=name, args=list(args)))
    pane = next(p for p in tmux.panes.values() if p.info.session_name == made.tmux_session)
    return made.id, pane.info.pane_id


def _restart(tmux: FakeTmux) -> None:
    """The machine restarts: every pane is gone, and the next tmux server is another one."""
    tmux.panes.clear()
    tmux.servers[SOCKET] = None


def test_a_restart_keeps_sessions_and_a_closed_pane_drops_its_own(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app = make_app()
    monitor, repo = app.state.monitor, app.state.sessions.repo
    kept, _ = _start(app, tmux, tmp_path, "worker", "--model", "opus", "Fix the build")
    closed, closed_pane = _start(app, tmux, tmp_path, "scratch")
    monitor.tick()
    del tmux.panes[(SOCKET, closed_pane)]  # /exit: the same server runs on
    monitor.tick()
    assert repo.get(closed) is None and repo.get(kept).interrupted_at is None

    fresh = make_app()  # the daemon restarts too, with the machine
    _restart(tmux)
    fresh.state.monitor.tick()
    record = fresh.state.sessions.repo.get(kept)
    assert record.interrupted_at is not None and record.launch_args == ["--model", "opus"]
    listed = {s.id: s for s in fresh.state.directory.list()}
    assert listed[kept].interrupted_at and not listed[kept].capabilities.screen

    # A new server: a pane of the same id is not the interrupted session's, and is adopted as its own.
    tmux.servers[SOCKET] = "9:99"
    tmux.add_pane(SOCKET, "elsewhere", "claude")
    fresh.state.monitor.tick()
    assert fresh.state.sessions.repo.get(kept).interrupted_at is not None
    assert any(r.source == SessionSource.ADOPTED for r in fresh.state.sessions.repo.list())


def test_another_server_on_the_socket_means_a_restart(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app = make_app()
    session_id, pane_id = _start(app, tmux, tmp_path, "worker")
    app.state.monitor.tick()
    again = make_app()
    del tmux.panes[(SOCKET, pane_id)]
    tmux.servers[SOCKET] = "7:77"  # tmux restarted (a new server), the daemon with it
    again.state.monitor.tick()
    assert again.state.sessions.repo.get(session_id).interrupted_at is not None


def test_started_again_under_its_own_id_resuming_its_conversation(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app = make_app()
    session_id, pane_id = _start(app, tmux, tmp_path, "worker", "--model", "opus", "Fix the build")
    sessions = app.state.sessions
    sessions.know_agent(sessions.repo.get(session_id), f"/home/dev/.claude/projects/x/{AGENT}.jsonl")
    app.state.teams.set_role(session_id, "worker", None)
    app.state.directory.pin(session_id, True)
    sessions.live_of(session_id).hook = HookState(AgentState.BUSY, at=time.monotonic())
    sessions.repo.save_hook_state(session_id, sessions.live_of(session_id).hook.dump())
    fresh = make_app()
    _restart(tmux)
    fresh.state.monitor.tick()
    client = TestClient(fresh)
    _, token = fresh.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}

    asked = client.get("/v1/recovery", headers=auth).json()
    assert asked["mode"] == "ask" and [s["id"] for s in asked["sessions"]] == [session_id]
    (started,) = client.post("/v1/recovery", json={"session_ids": [session_id]}, headers=auth).json()
    assert started["id"] == session_id and started["interrupted_at"] is None
    pane = next(p for p in tmux.panes.values() if p.info.session_name == started["tmux_session"])
    assert pane.argv[pane.argv.index("--model") + 1] == "opus" and "Fix the build" not in pane.argv
    assert pane.argv[-2:] == ["--resume", AGENT]
    assert pane.sent == []  # nothing sent: it does not carry on by itself
    listed = next(s for s in client.get("/v1/sessions", headers=auth).json() if s["id"] == session_id)
    assert (listed["name"], listed["team_role"], listed["pinned"]) == ("worker", "worker", True)  # its own still
    assert listed["state"] != "busy"  # what it was doing before is no more
    assert client.post("/v1/recovery", json={"session_ids": [session_id]}, headers=auth).json() == []  # once


def test_the_owner_may_let_one_go(make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path) -> None:
    app = make_app()
    keep, _ = _start(app, tmux, tmp_path, "keep")
    drop, _ = _start(app, tmux, tmp_path, "drop")
    fresh = make_app()
    _restart(tmux)
    fresh.state.monitor.tick()
    client = TestClient(fresh)
    _, token = fresh.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}
    assert client.post("/v1/recovery", json={"session_ids": [keep]}, headers=auth).status_code == 200
    assert fresh.state.sessions.repo.get(drop).interrupted_at is not None  # unticked: still waiting
    assert client.delete(f"/v1/sessions/{drop}", headers=auth).status_code == 204
    assert fresh.state.sessions.repo.get(drop) is None


def test_the_mode_says_ask_start_again_or_let_go(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    for mode, expect in (("ask", "interrupted"), ("auto", "running"), ("off", "gone")):
        tmux.panes.clear()
        tmux.servers.clear()
        app = make_app(**{"state_dir": tmp_path / mode})
        session_id, _ = _start(app, tmux, tmp_path, mode)
        fresh = make_app(**{"state_dir": tmp_path / mode})
        _restart(tmux)
        fresh.state.monitor.tick()
        fresh.state.recovery.settings = RecoverySettings(mode=mode)  # type: ignore[arg-type]
        asked = fresh.state.recovery.check()
        record = fresh.state.sessions.repo.get(session_id)
        found = "gone" if record is None else "interrupted" if record.interrupted_at else "running"
        assert (found, asked) == (expect, 1 if mode == "ask" else 0)
        assert fresh.state.recovery.check() == 0  # told once


def test_an_adopted_session_is_kept_only_when_its_conversation_can_be_resumed(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app = make_app()
    known = tmux.add_pane("default", "known", "claude")
    tmux.add_pane("default", "unknown", "claude")
    app.state.monitor.tick()
    adopted = {r.tmux_session: r for r in app.state.sessions.repo.list() if r.source == SessionSource.ADOPTED}
    app.state.sessions.know_agent(adopted["known"], f"/x/{AGENT}.jsonl")
    del known
    fresh = make_app()
    tmux.panes.clear()
    tmux.servers["default"] = None
    fresh.state.monitor.tick()
    left = {r.tmux_session: r for r in fresh.state.sessions.repo.list()}
    assert left["known"].interrupted_at is not None and "unknown" not in left


def test_a_terminal_picks_all_some_or_none() -> None:
    from muxtower.cli.recover import _pick

    listed = [{"id": "a"}, {"id": "b"}, {"id": "c"}]
    assert _pick(listed, "a") == listed and _pick(listed, "") == []
    assert _pick(listed, "1 3") == [{"id": "a"}, {"id": "c"}]
    assert _pick(listed, "n") == []
    assert _pick(listed, "4") is None and _pick(listed, "1 x") is None


def test_the_concierge_waits_to_be_resumed_rather_than_starting_anew(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    on = {"concierge.enabled": True, "concierge.cwd": tmp_path / "home"}
    app = make_app(**on)
    concierge = app.state.concierge
    concierge.ensure()
    first = concierge.session_id
    fresh = make_app(**on)
    _restart(tmux)
    fresh.state.monitor.tick()
    assert fresh.state.concierge.ensure() is False  # interrupted: waits for the owner, no second one
    assert fresh.state.concierge.session_id == first and tmux.panes == {}
    (again,) = fresh.state.recovery.recover([first])
    assert again.id == first
    pane = next(iter(tmux.panes.values()))
    assert "--mcp-config" in pane.argv and "--model" in pane.argv  # its own MCP and model, as started
    assert fresh.state.directory.get(first).role == "concierge"
    fresh.state.sessions.forget(first)  # had the owner let it go instead: a new one starts
    assert fresh.state.concierge.ensure() is True and fresh.state.concierge.session_id != first
