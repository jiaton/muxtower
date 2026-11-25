"""A pane muxtower started always has its session. A listing that misses a pane still running never lets its
session go, and a pane of muxtower's own whose session went missing (or was kept as interrupted) gets it
back under its own id, its hooks wired again. Known by what muxtower left on the pane, never by its
command: on macOS, Claude Code's is its version."""

from collections.abc import Callable
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.sessions.models import CreateSession
from muxtower.sessions.ports import SessionSource
from muxtower.terminal.ports import LaunchMarks, PaneRef
from tests.fakes import FakePane, FakeTmux

SOCKET = "muxtower"
VERSION = "2.1.400"  # what tmux says a Claude Code pane runs, on macOS


def _start(app: FastAPI, tmux: FakeTmux, tmp_path: Path, name: str, command: str = VERSION) -> tuple[str, FakePane]:
    made = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name=name))
    pane = next(p for p in tmux.panes.values() if p.info.session_name == made.tmux_session)
    pane.info = replace(pane.info, command=command)
    return made.id, pane


def _hook(app: FastAPI, session_id: str, pane: FakePane) -> int:
    headers = {"Authorization": f"Bearer {pane.env['MUXTOWER_HOOK_TOKEN']}", "X-Muxtower-Session": session_id}
    body = {"hook_event_name": "Stop", "last_assistant_message": "Done."}
    return TestClient(app).post("/v1/hooks/claude-code", json=body, headers=headers).status_code


def _hook_files(app: FastAPI, session_id: str) -> list[str]:
    return sorted(p.name for p in app.state.sessions.hook_files.glob(f"{session_id}.*"))


def test_a_listing_that_misses_a_running_pane_keeps_its_session(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app = make_app()
    session_id, pane = _start(app, tmux, tmp_path, "Plan the launch")
    app.state.monitor.tick()
    files = _hook_files(app, session_id)
    assert files

    tmux.unlisted.add(pane.info.pane_id)  # one listing leaves it out, though it runs on
    app.state.monitor.tick()
    record = app.state.sessions.repo.get(session_id)
    assert record is not None and record.interrupted_at is None
    assert _hook_files(app, session_id) == files and _hook(app, session_id, pane) == 200

    tmux.unlisted.clear()
    app.state.monitor.tick()
    assert [s.id for s in app.state.directory.list()] == [session_id]


def test_a_closed_pane_still_ends_its_session(make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path) -> None:
    app = make_app()
    session_id, pane = _start(app, tmux, tmp_path, "Plan the launch")
    app.state.monitor.tick()
    del tmux.panes[(SOCKET, pane.info.pane_id)]
    app.state.monitor.tick()
    assert app.state.sessions.repo.get(session_id) is None and _hook_files(app, session_id) == []


@pytest.mark.parametrize("command", [VERSION, "claude"])
def test_a_running_pane_whose_session_was_lost_gets_it_back_under_its_own_id(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path, command: str
) -> None:
    app = make_app()
    session_id, pane = _start(app, tmux, tmp_path, "Plan the launch", command)
    kept, _ = _start(app, tmux, tmp_path, "Review the docs")
    app.state.monitor.tick()
    created = app.state.sessions.repo.get(session_id).created_at
    app.state.sessions.forget(session_id)  # what an earlier version did on a listing that missed it
    assert _hook_files(app, session_id) == [] and _hook(app, session_id, pane) == 404

    fresh = make_app()  # also after the daemon restarts
    fresh.state.monitor.tick()
    record = fresh.state.sessions.repo.get(session_id)
    assert record is not None and record.source == SessionSource.LAUNCHED  # not adopted under another id
    assert record.name == "Plan the launch" and record.pane == PaneRef(SOCKET, pane.info.pane_id)
    assert record.runtime == "claude-code" and record.interrupted_at is None and record.server_id
    assert record.created_at != created and record.created_at == datetime.fromtimestamp(1700000000, UTC)
    assert {r.id for r in fresh.state.sessions.repo.list()} == {session_id, kept}
    # Its hooks and MCP work again, with the token its process holds, their files written anew.
    assert _hook(fresh, session_id, pane) == 200
    assert {f.removeprefix(session_id) for f in _hook_files(fresh, session_id)} >= {".json", ".relay.json", ".mcp.json"}
    assert fresh.state.sessions.holds_token(session_id, pane.env["MUXTOWER_HOOK_TOKEN"])
    assert sorted(s.id for s in fresh.state.directory.list()) == sorted([session_id, kept])


def test_an_interrupted_session_whose_pane_runs_on_is_running_again(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app = make_app()
    session_id, pane = _start(app, tmux, tmp_path, "Plan the launch")
    app.state.monitor.tick()
    record = app.state.sessions.repo.get(session_id)
    app.state.sessions.interrupt(record)  # taken for one a restart interrupted, though it ran on
    app.state.monitor.tick()
    record = app.state.sessions.repo.get(session_id)
    assert record.interrupted_at is None and record.pane == PaneRef(SOCKET, pane.info.pane_id)
    assert app.state.recovery.interrupted() == []
    assert _hook(app, session_id, pane) == 200


def test_a_pane_is_ours_only_by_its_marks(make_app: Callable[..., FastAPI], tmux: FakeTmux) -> None:
    app = make_app()
    asked: list[PaneRef] = []
    marks = tmux.launch_marks

    def counted(ref: PaneRef) -> LaunchMarks | None:
        asked.append(ref)
        return marks(ref)

    tmux.launch_marks = counted  # type: ignore[method-assign]
    bare = tmux.add_pane(SOCKET, "mxt-0a1b2c3d", VERSION)  # named like ours, carries no session
    wrong = tmux.add_pane(SOCKET, "mxt-99999999", VERSION)  # carries an id its name does not match
    wrong.env = {"MUXTOWER_SESSION_ID": "0a1b2c3d4e5f", "MUXTOWER_HOOK_TOKEN": "made-up"}
    wrong.argv = ["claude", "--settings", "/tmp/x.json"]  # noqa: S108
    tmux.add_pane(SOCKET, "notes", VERSION)  # not muxtower's: never asked about
    for _ in range(3):
        app.state.monitor.tick()
    assert app.state.sessions.repo.list() == []
    assert sorted(r.pane_id for r in asked) == sorted([bare.info.pane_id, wrong.info.pane_id])  # once each


def test_a_pane_carrying_a_session_that_runs_elsewhere_is_left_alone(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app = make_app()
    session_id, pane = _start(app, tmux, tmp_path, "Plan the launch")
    copy = tmux.add_pane(SOCKET, pane.info.session_name, VERSION)
    copy.env, copy.argv = dict(pane.env), list(pane.argv)  # a second window of its tmux session
    app.state.monitor.tick()
    app.state.monitor.tick()
    assert [r.pane for r in app.state.sessions.repo.list()] == [PaneRef(SOCKET, pane.info.pane_id)]
