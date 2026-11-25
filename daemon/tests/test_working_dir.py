"""Where an agent works now (`working_dir`), from its transcript's latest folder: Claude Code's `cwd` on each
line, Codex's thread folder on each turn; read once per version of the file, reaching the hub from a node."""

import dataclasses
import json
from pathlib import Path

from fastapi.testclient import TestClient

from muxtower.app import create_app
from muxtower.config import load_settings
from muxtower.sessions.monitor import Monitor
from muxtower.sessions.transcript_cwd import TranscriptCwds
from muxtower.sources.codex.thread import CodexThread, to_session
from tests.fakes import FakeTmux
from tests.test_linking import FakeProcesses
from tests.test_nodes import nodes, report

START = "/home/me/workspace"


def line(cwd: str, kind: str = "user") -> str:
    return json.dumps({"type": kind, "cwd": cwd, "message": {"content": "made-up"}}) + "\n"


def codex_line(kind: str, cwd: str) -> str:
    return json.dumps({"timestamp": "2026-01-01T00:00:00Z", "type": kind, "payload": {"cwd": cwd}}) + "\n"


def test_the_latest_line_with_a_folder_wins_and_lines_without_one_are_passed_over(tmp_path: Path) -> None:
    t = tmp_path / "a.jsonl"
    t.write_text(line(START) + line(f"{START}/launch-plan") + json.dumps({"type": "summary"}) + "\n")
    assert TranscriptCwds().latest(str(t)) == f"{START}/launch-plan"
    assert TranscriptCwds().latest(str(tmp_path / "gone.jsonl")) is None


def test_it_is_read_once_per_version_and_then_only_what_was_appended(tmp_path: Path) -> None:
    t = tmp_path / "a.jsonl"
    t.write_text(line(START) * 50)
    cwds = TranscriptCwds()
    assert cwds.latest(str(t)) == START and cwds.reads == 1
    assert cwds.latest(str(t)) == START and cwds.reads == 1  # unchanged: not read again
    with t.open("a") as f:
        f.write(line(f"{START}/launch-plan"))
        f.write('{"type": "user", "cwd": "/half')  # still being written: taken once it ends
    assert cwds.latest(str(t)) == f"{START}/launch-plan" and cwds.reads == 2
    with t.open("a") as f:
        f.write(f'/written"}}\n{json.dumps({"type": "summary"})}\n')
    assert cwds.latest(str(t)) == "/half/written"
    t.write_text(line(START))  # replaced by a shorter one: read again from its end
    assert cwds.latest(str(t)) == START


def test_a_folder_far_back_is_found_by_looking_further(tmp_path: Path) -> None:
    t = tmp_path / "a.jsonl"
    t.write_text(line(f"{START}/launch-plan") + (json.dumps({"type": "x", "pad": "y" * 1000}) + "\n") * 200)
    assert TranscriptCwds().latest(str(t)) == f"{START}/launch-plan"


def test_a_codex_rollout_says_its_threads_folder_at_each_turn(tmp_path: Path) -> None:
    t = tmp_path / "rollout.jsonl"
    t.write_text(codex_line("session_meta", START) + codex_line("turn_context", f"{START}/api"))
    assert TranscriptCwds().latest(str(t)) == f"{START}/api"


def _app(tmp_path: Path, tmux: FakeTmux):  # type: ignore[no-untyped-def]
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False},
    )  # fmt: skip
    app = create_app(settings, tmux=tmux, run_loops=False)
    _, token = app.state.tokens.create("phone")
    return app, TestClient(app), {"Authorization": f"Bearer {token}"}


def test_a_pane_lists_the_folder_its_transcript_was_last_written_in(tmp_path: Path) -> None:
    tmux = FakeTmux()
    pane = tmux.add_pane("default", "work", "claude", cwd=START)
    pane.info = dataclasses.replace(pane.info, pid=4242)
    t = tmp_path / "conv.jsonl"
    t.write_text(line(START) + line(f"{START}/launch-plan"))
    app, client, auth = _app(tmp_path, tmux)
    monitor = Monitor(app.state.sessions, FakeProcesses({}, {4242: str(t)}))
    monitor.tick()

    [listed] = client.get("/v1/sessions", headers=auth).json()
    assert listed["cwd"] == START and listed["working_dir"] == f"{START}/launch-plan"
    reads = monitor.cwds.reads
    client.get("/v1/sessions", headers=auth)
    monitor.tick()
    assert monitor.cwds.reads == reads  # neither a list nor a tick reads an unchanged transcript again

    with t.open("a") as f:
        f.write(line(START))  # back where it started: nothing deeper to say
    monitor.tick()
    assert client.get("/v1/sessions", headers=auth).json()[0]["working_dir"] is None
    with t.open("a") as f:
        f.write(line("/srv/elsewhere"))  # outside the folder it started in: not where it works, for the list
    monitor.tick()
    assert client.get("/v1/sessions", headers=auth).json()[0]["working_dir"] is None


def test_a_codex_pane_lists_its_threads_folder(tmp_path: Path) -> None:
    tmux = FakeTmux()
    pane = tmux.add_pane("default", "work", "codex", cwd=START)
    pane.info = dataclasses.replace(pane.info, pid=4343)
    t = tmp_path / "rollout.jsonl"
    t.write_text(codex_line("session_meta", START) + codex_line("turn_context", f"{START}/api"))
    app, client, auth = _app(tmp_path, tmux)
    Monitor(app.state.sessions, FakeProcesses({}, {4343: str(t)})).tick()
    assert client.get("/v1/sessions", headers=auth).json()[0]["working_dir"] == f"{START}/api"


def test_a_codex_thread_is_listed_in_its_threads_folder() -> None:
    thread = CodexThread({"id": "019a-thread", "cwd": f"{START}/api", "name": "Plan the launch"})
    listed = to_session(thread)
    assert listed.cwd == f"{START}/api" and listed.working_dir is None  # where it works is where it is listed


def test_a_node_sessions_folder_reaches_the_hub(tmp_path: Path) -> None:
    hub, source, _ = nodes(tmp_path)
    name, _ = hub.claim("mac")
    hub.on_event(name, "sessions", [report(id="a1", cwd=START, working_dir=f"{START}/launch-plan")])
    [view] = source.views()
    assert view.id == "mac~a1" and view.working_dir == f"{START}/launch-plan"
