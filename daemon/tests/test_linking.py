import dataclasses
import json
import os
from pathlib import Path

from fastapi.testclient import TestClient

from muxtower.app import create_app
from muxtower.config import load_settings
from muxtower.sessions.claude_processes import ClaudeProcess, ClaudeProcesses
from muxtower.sessions.monitor import Monitor
from muxtower.sources.remote_control.ports import RawEvent
from muxtower.sources.remote_control.service import RemoteControlSource
from tests.fakes import FakeTmux
from tests.rc_fakes import FakeRemoteControl, assistant, session


def test_finds_the_remote_session_of_a_panes_claude_process(tmp_path: Path) -> None:
    sessions = tmp_path / "sessions"
    sessions.mkdir()
    pid = os.getpid()
    processes = ClaudeProcesses(tmp_path)
    assert processes.remote_id(pid) is None  # no Claude Code here
    (sessions / f"{pid}.json").write_text(json.dumps({"pid": pid, "bridgeSessionId": "session_01ABC"}))
    assert processes.remote_id(pid) == "cse_01ABC"
    (sessions / f"{pid}.json").write_text(json.dumps({"pid": pid, "bridgeSessionId": None}))
    assert processes.remote_id(pid) is None


def test_finds_claude_under_a_shell_where_the_kernel_lists_no_children(tmp_path: Path) -> None:
    # a pane whose process is a shell that started Claude Code; this /proc has no task/*/children files
    proc = tmp_path / "proc"
    for pid, parent, comm in [(100, 1, "zsh"), (200, 100, "claude (x) y"), (300, 1, "sshd")]:
        (proc / str(pid) / "task" / str(pid)).mkdir(parents=True)
        (proc / str(pid) / "stat").write_text(f"{pid} ({comm}) S {parent} {pid} {pid} 0")
    sessions = tmp_path / "claude" / "sessions"
    sessions.mkdir(parents=True)
    (sessions / "200.json").write_text(json.dumps({"pid": 200, "bridgeSessionId": "session_01SHELL"}))
    processes = ClaudeProcesses(tmp_path / "claude", proc=proc)
    assert processes.remote_id(100) == "cse_01SHELL"
    assert processes.remote_id(300) is None


class FakeProcesses:
    def __init__(
        self, links: dict[int, str], transcripts: dict[int, str] | None = None, names: dict[int, str] | None = None
    ) -> None:
        self.links = links
        self.transcripts = transcripts or {}
        self.names = names or {}

    def name(self, pane_pid: int, screen: str = "") -> str | None:
        return self.names.get(pane_pid)

    def remote_id(self, pane_pid: int, screen: str = "") -> str | None:
        return self.links.get(pane_pid)

    def transcript(self, pane_pid: int, screen: str = "") -> str | None:
        return self.transcripts.get(pane_pid)

    def running(self) -> dict[str, ClaudeProcess]:
        return {}


def test_a_tmux_agent_with_remote_control_is_listed_once(tmp_path: Path) -> None:
    tmux = FakeTmux()
    pane = tmux.add_pane("default", "work", "claude")
    pane.info = dataclasses.replace(pane.info, pid=4242)
    port = FakeRemoteControl()
    port.sessions = [session("cse_1", title="Fix the login bug"), session("cse_2")]
    port.events = {"cse_1": [assistant(1, {"type": "text", "text": "Fixed."})]}
    source = RemoteControlSource(port, {})
    source.tick()
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False},
    )  # fmt: skip
    app = create_app(settings, tmux=tmux, run_loops=False, remote_control=source)
    Monitor(app.state.sessions, FakeProcesses({4242: "cse_1"})).tick()
    client = TestClient(app)
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}

    listed = client.get("/v1/sessions", headers=auth).json()
    assert sorted(s["id"] for s in listed) == sorted([listed[0]["id"], "cse_2"]) and len(listed) == 2
    merged = next(s for s in listed if s["remote_id"] == "cse_1")
    assert merged["name"] == "Fix the login bug" and merged["source"] == "adopted"
    assert merged["capabilities"]["screen"] and merged["capabilities"]["conversation"]
    assert merged["updated_at"].startswith("2026-10-18T10:00:00")  # the remote log's last event
    assert client.get("/v1/sessions/cse_1", headers=auth).json()["id"] == merged["id"]
    conv = client.get(f"/v1/sessions/{merged['id']}/conversation", headers=auth).json()
    assert conv["session_id"] == merged["id"] and [i["text"] for i in conv["items"]] == ["Fixed."]


def test_a_session_started_during_a_scan_is_neither_dropped_nor_adopted(tmp_path: Path) -> None:
    from muxtower.sessions.models import CreateSession

    tmux = FakeTmux()
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False, "adopt_sockets": []},
    )  # fmt: skip
    app = create_app(settings, tmux=tmux, run_loops=False)
    sessions = app.state.sessions
    real_list = tmux.list_panes
    created: list[str] = []

    def racing_list(socket: str):  # type: ignore[no-untyped-def]
        before = real_list(socket)  # the scan's snapshot of panes
        if not created:  # meanwhile, a request starts a session
            created.append(sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path))).id)
        return before

    tmux.list_panes = racing_list  # type: ignore[method-assign]
    Monitor(sessions).reconcile()
    tmux.list_panes = real_list  # type: ignore[method-assign]
    Monitor(sessions).reconcile()
    assert [r.id for r in sessions.repo.list()] == created


def test_sessions_on_the_hub_carry_its_name_and_their_folder(tmp_path: Path) -> None:
    from muxtower.sessions.claude_processes import ClaudeProcess

    class Running(FakeProcesses):
        def running(self) -> dict[str, ClaudeProcess]:
            return {"cse_here": ClaudeProcess(pid=1, cwd="/srv/app", entrypoint="sdk-cli")}

    tmux = FakeTmux()
    tmux.add_pane("default", "work", "claude", cwd="/home/me/web")
    port = FakeRemoteControl()
    port.sessions = [session("cse_here", environment_id=""), session("cse_away", environment_id="")]
    port.events["cse_here"] = [
        RawEvent(1, None, "worker", {"type": "system", "subtype": "vcs_state_changed", "cwd": "/srv/app/api"})
    ]
    port.events["cse_away"] = [
        RawEvent(1, None, "worker", {"type": "system", "subtype": "vcs_state_changed", "cwd": "/srv/other"})
    ]
    source = RemoteControlSource(port, {})
    source.tick()
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"name": "hub", "state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False},
    )  # fmt: skip
    app = create_app(settings, tmux=tmux, run_loops=False, remote_control=source)
    app.state.directory.processes = Running({})
    Monitor(app.state.sessions).reconcile()
    by_name = {s.name: s for s in app.state.directory.list()}
    assert (by_name["work"].machine, by_name["work"].cwd) == ("hub", "/home/me/web")
    here = next(s for s in by_name.values() if s.id == "cse_here")
    away = next(s for s in by_name.values() if s.id == "cse_away")
    # Listed where it started; where it works now, inside that, is said beside it.
    assert (here.machine, here.cwd, here.working_dir) == ("hub", "/srv/app", "/srv/app/api")
    assert here.origin == "claude_code_sdk_cli"  # from the process file, not the listing
    assert (away.machine, away.cwd) == (None, "/srv/other")


def test_a_pane_without_hooks_starts_from_its_windows_last_output(tmp_path: Path) -> None:
    tmux = FakeTmux()
    pane = tmux.add_pane("default", "old", "claude")
    pane.info = dataclasses.replace(pane.info, activity=1_700_000_000)
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False},
    )  # fmt: skip
    app = create_app(settings, tmux=tmux, run_loops=False)
    Monitor(app.state.sessions).tick()
    (session,) = app.state.sessions.list()
    assert session.updated_at.timestamp() == 1_700_000_000


def test_running_processes_carry_folder_and_entrypoint(tmp_path: Path) -> None:
    sessions = tmp_path / "sessions"
    sessions.mkdir()
    me = os.getpid()  # alive, so it counts as running
    (sessions / f"{me}.json").write_text(
        json.dumps({"pid": me, "cwd": "/srv/app", "entrypoint": "cli", "bridgeSessionId": "session_abc"})
    )
    (sessions / "999999999.json").write_text(json.dumps({"pid": 999999999, "bridgeSessionId": "session_gone"}))
    (process,) = ClaudeProcesses(tmp_path).running().values()
    assert (process.cwd, process.origin) == ("/srv/app", "claude_code_cli")


def test_a_tmux_agent_goes_by_its_own_name_until_the_owner_names_it(tmp_path: Path) -> None:
    tmux = FakeTmux()
    pane = tmux.add_pane("default", "0", "claude")  # a tmux session named "0" says nothing
    pane.info = dataclasses.replace(pane.info, pid=4242)
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False},
    )  # fmt: skip
    app = create_app(settings, tmux=tmux, run_loops=False)
    processes = FakeProcesses({}, names={4242: "Home project documentation"})
    Monitor(app.state.sessions, processes).tick()
    client = TestClient(app)
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}
    (listed,) = client.get("/v1/sessions", headers=auth).json()
    assert listed["name"] == "Home project documentation"  # what Claude Code calls it, not "0"

    client.patch(f"/v1/sessions/{listed['id']}", headers=auth, json={"name": "Docs"})
    processes.names[4242] = "Something else"
    Monitor(app.state.sessions, processes).tick()
    assert client.get(f"/v1/sessions/{listed['id']}", headers=auth).json()["name"] == "Docs"  # the owner's wins


def test_where_an_agent_cds_to_never_moves_where_it_is_listed() -> None:
    from muxtower.sessions.merged import deeper

    assert deeper("/home/me/projects", "/home/me/projects/web") == "/home/me/projects/web"  # said beside it
    assert deeper("/home/me/projects/app", "/home/me/projects/app-fix") is None  # another worktree: not even said
    assert deeper("/home/me/projects/app", "/srv/other") is None
    assert deeper("", "/srv/other") is None


def _moved_setup(tmp_path: Path, hops: list[str]) -> tuple[ClaudeProcesses, Path]:
    """A pane's Claude Code (this process) whose conversation Claude Code moved to the background: its
    transcript `continued-in` each of `hops` in turn, its own process file left with no bridge."""
    sessions, projects = tmp_path / "sessions", tmp_path / "projects" / "-home-me-shop"
    sessions.mkdir()
    projects.mkdir(parents=True)
    ids = ["00000000-0000-4000-8000-000000000000", *hops]
    for here, there in zip(ids, ids[1:], strict=False):
        line = json.dumps({"type": "continued-in", "continuedInSessionId": there, "sessionId": here})
        (projects / f"{here}.jsonl").write_text(json.dumps({"type": "user"}) + "\n" + line + "\n")
    (projects / f"{ids[-1]}.jsonl").write_text(json.dumps({"type": "user"}) + "\n")
    pane = os.getpid()
    (sessions / f"{pane}.json").write_text(
        json.dumps({"pid": pane, "sessionId": ids[0], "cwd": "/home/me/shop", "bridgeSessionId": None})
    )
    return ClaudeProcesses(tmp_path), sessions


B = "11111111-1111-4111-8111-111111111111"
C = "22222222-2222-4222-8222-222222222222"
DEAD = 2**22 + 12345  # above any pid this system hands out (pid_max is at most 2**22)


def test_a_conversation_moved_to_the_background_keeps_its_remote_session_and_transcript(tmp_path: Path) -> None:
    processes, sessions = _moved_setup(tmp_path, [B])
    pane, host = os.getpid(), os.getppid()  # the background process: alive
    assert processes.remote_id(pane) is None and not processes.moved(pane)  # not running anywhere yet
    # A stale file of a dead process that once ran B (its pid since gone) is not it.
    (sessions / f"{DEAD}.json").write_text(json.dumps({"pid": DEAD, "sessionId": B, "bridgeSessionId": "session_OLD"}))
    assert processes.remote_id(pane) is None
    (sessions / f"{host}.json").write_text(
        json.dumps(
            {"pid": host, "sessionId": B, "cwd": "/home/me/shop", "bridgeSessionId": "session_01MOVED", "kind": "bg"}
        )
    )
    assert processes.remote_id(pane) == "cse_01MOVED"
    agents_view = "Your conversation moved to the background \u2014 enter\nopens it \u00b7 esc returns to it"
    assert processes.moved(pane, agents_view)
    # Enter brought it back into the pane: still merged (its bridge is still there), no longer "moved"
    assert not processes.moved(pane, "> \n? for shortcuts") and processes.remote_id(pane) == "cse_01MOVED"
    assert processes.transcript(pane) == str(tmp_path / "projects" / "-home-me-shop" / f"{B}.jsonl")


def test_a_conversation_moved_twice_follows_the_chain(tmp_path: Path) -> None:
    processes, sessions = _moved_setup(tmp_path, [B, C])
    pane, host = os.getpid(), os.getppid()
    (sessions / f"{DEAD}.json").write_text(json.dumps({"pid": DEAD, "sessionId": B, "bridgeSessionId": "session_01B"}))
    (sessions / f"{host}.json").write_text(json.dumps({"pid": host, "sessionId": C, "bridgeSessionId": "session_01C"}))
    assert processes.remote_id(pane) == "cse_01C"
    assert processes.transcript(pane).endswith(f"{C}.jsonl")


def test_a_pane_with_its_own_bridge_is_not_moved(tmp_path: Path) -> None:
    processes, sessions = _moved_setup(tmp_path, [B])
    pane, host = os.getpid(), os.getppid()
    (sessions / f"{pane}.json").write_text(
        json.dumps({"pid": pane, "sessionId": B, "cwd": "/home/me/shop", "bridgeSessionId": "session_01OWN"})
    )
    (sessions / f"{host}.json").write_text(json.dumps({"pid": host, "sessionId": C, "bridgeSessionId": "session_01X"}))
    assert processes.remote_id(pane) == "cse_01OWN" and not processes.moved(pane)


def test_a_moved_tmux_agent_merges_with_its_remote_session_and_says_so(tmp_path: Path) -> None:
    tmux = FakeTmux()
    pane = tmux.add_pane("default", "work", "claude")
    pane.info = dataclasses.replace(pane.info, pid=4242)
    port = FakeRemoteControl()
    port.sessions = [session("cse_1", title="Fix the login bug")]
    source = RemoteControlSource(port, {})
    source.tick()
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False},
    )  # fmt: skip
    app = create_app(settings, tmux=tmux, run_loops=False, remote_control=source)

    class Moved(FakeProcesses):
        def moved(self, pane_pid: int, screen: str = "") -> bool:
            return pane_pid == 4242

    Monitor(app.state.sessions, Moved({4242: "cse_1"})).tick()
    client = TestClient(app)
    _, token = app.state.tokens.create("phone")
    listed = client.get("/v1/sessions", headers={"Authorization": f"Bearer {token}"}).json()
    (merged,) = listed
    assert merged["remote_id"] == "cse_1" and merged["in_background"] is True


def _stat(proc: Path, pid: int, ticks: int, parent: int = 1) -> None:
    (proc / str(pid) / "task" / str(pid)).mkdir(parents=True, exist_ok=True)
    fields = ["S", str(parent), *["0"] * 17, str(ticks)]
    (proc / str(pid) / "stat").write_text(f"{pid} (claude) " + " ".join(fields))


def test_a_process_file_from_before_a_restart_is_not_the_process_now_at_its_pid(tmp_path: Path) -> None:
    """After a reboot, a file left from before names a pid another process has now (made-up ids)."""
    proc = tmp_path / "proc"
    (proc).mkdir()
    (proc / "stat").write_text("cpu 1 2 3\nbtime 1000000\n")
    pid = os.getpid()  # alive
    _stat(proc, pid, ticks=1400)
    sessions = tmp_path / "claude" / "sessions"
    sessions.mkdir(parents=True)
    stale = {"pid": pid, "sessionId": "old-conv", "cwd": "/w", "bridgeSessionId": "session_01OLD",
             "name": "before the reboot", "procStart": "10358319", "startedAt": 999_000_000}  # fmt: skip
    (sessions / f"{pid}.json").write_text(json.dumps(stale))
    processes = ClaudeProcesses(tmp_path / "claude", proc=proc)
    assert processes.remote_id(pid) is None and processes.name(pid) is None and processes.transcript(pid) is None
    assert processes.running() == {}
    # The same file, written by the process now there: its own.
    (sessions / f"{pid}.json").write_text(json.dumps({**stale, "procStart": "1400"}))
    fresh = ClaudeProcesses(tmp_path / "claude", proc=proc)
    assert fresh.remote_id(pid) == "cse_01OLD" and fresh.name(pid) == "before the reboot"
    assert list(fresh.running()) == ["cse_01OLD"]


def test_without_proc_start_the_files_start_time_must_match_the_process(tmp_path: Path) -> None:
    """macOS writes no `procStart` there (made up here): `startedAt` against when the process started."""
    proc = tmp_path / "proc"
    proc.mkdir()
    (proc / "stat").write_text("cpu 1 2 3\nbtime 1000000\n")
    pid = os.getpid()
    _stat(proc, pid, ticks=50_000)  # started at 1000000 + 500 s
    sessions = tmp_path / "claude" / "sessions"
    sessions.mkdir(parents=True)
    file = sessions / f"{pid}.json"
    file.write_text(json.dumps({"pid": pid, "bridgeSessionId": "session_01MAC", "startedAt": 1_000_501_500}))
    assert ClaudeProcesses(tmp_path / "claude", proc=proc).remote_id(pid) == "cse_01MAC"  # 1.5 s after: its own
    file.write_text(json.dumps({"pid": pid, "bridgeSessionId": "session_01MAC", "startedAt": 900_000_000}))
    assert ClaudeProcesses(tmp_path / "claude", proc=proc).remote_id(pid) is None  # days before: another's


class RestartedProcesses(FakeProcesses):
    """After a reboot: the pane's Claude Code resumed its conversation with a new bridge; the old bridge
    is what a process file left from before ran (`ClaudeProcesses.former_remote_ids`)."""

    def __init__(self, links: dict[int, str], formers: dict[int, list[str]]) -> None:
        super().__init__(links)
        self.formers = formers

    def former_remote_ids(self, pane_pid: int) -> list[str]:
        return self.formers.get(pane_pid, [])


def test_after_a_reboot_the_old_bridge_is_folded_into_the_resumed_session_not_its_fork_parent(tmp_path: Path) -> None:
    tmux = FakeTmux()
    pane = tmux.add_pane("default", "work", "claude")
    pane.info = dataclasses.replace(pane.info, pid=4242)
    port = FakeRemoteControl()
    # Remote Control still lists the old bridge; the new one's history was uploaded at once, so it reads
    # as a copy (a fork) of the old one.
    port.sessions = [
        session("cse_OLD", title="api-error rule", created_at="2026-11-13T09:00:00Z"),
        session("cse_NEW", title="planner", created_at="2026-11-14T22:35:00Z",
                tags=["remote-control-fork-parent:session_OLD"]),
        session("cse_SIBLING", title="a real fork", created_at="2026-11-14T10:00:00Z",
                tags=["remote-control-fork-parent:session_OLD"]),
    ]  # fmt: skip
    source = RemoteControlSource(port, {})
    source.tick()
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False},
    )  # fmt: skip
    app = create_app(settings, tmux=tmux, run_loops=False, remote_control=source)
    Monitor(app.state.sessions, RestartedProcesses({4242: "cse_NEW"}, {4242: ["cse_OLD"]})).tick()
    client = TestClient(app)
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}

    listed = client.get("/v1/sessions", headers=auth).json()
    ours = next(s for s in listed if s["remote_id"] == "cse_NEW")
    assert "cse_OLD" not in {s["id"] for s in listed}  # folded in: not a row of its own
    assert ours["fork_of"] is None  # the same conversation, not a fork of its earlier bridge
    sibling = next(s for s in listed if s["id"] == "cse_SIBLING")
    assert sibling["fork_of"] == ours["id"]  # a real fork of the old bridge is placed under the session
    assert client.get("/v1/sessions/cse_OLD", headers=auth).json()["id"] == ours["id"]
    assert client.get(f"/v1/sessions/{ours['id']}", headers=auth).json()["fork_of"] is None
    # Kept over a restart of the daemon: the process file may be gone by then.
    assert app.state.sessions.repo.remote_ids() == {"cse_NEW": ours["id"], "cse_OLD": ours["id"]}


def test_former_bridges_are_found_from_process_files_left_for_the_same_conversation(tmp_path: Path) -> None:
    proc = tmp_path / "proc"
    proc.mkdir()
    (proc / "stat").write_text("cpu 1 2 3\nbtime 1000000\n")
    pid = os.getpid()
    _stat(proc, pid, ticks=1400)
    sessions = tmp_path / "claude" / "sessions"
    sessions.mkdir(parents=True)
    now = {"pid": pid, "sessionId": "c2-conv", "cwd": "/w", "bridgeSessionId": "session_NEW", "procStart": "1400"}
    (sessions / f"{pid}.json").write_text(json.dumps(now))
    gone = {"pid": 999_999_99, "sessionId": "c2-conv", "cwd": "/w", "bridgeSessionId": "session_OLD"}
    (sessions / "99999999.json").write_text(json.dumps(gone))
    other = {"pid": 999_999_98, "sessionId": "another", "cwd": "/w", "bridgeSessionId": "session_ELSE"}
    (sessions / "99999998.json").write_text(json.dumps(other))
    processes = ClaudeProcesses(tmp_path / "claude", proc=proc)
    assert processes.former_remote_ids(pid) == ["cse_OLD"]
    # An earlier conversation that went on in this one (continued-in): its bridge was this session's too.
    current = "c2795c42-0000-4000-8000-000000000000"
    (sessions / f"{pid}.json").write_text(json.dumps({**now, "sessionId": current}))
    (sessions / "99999999.json").write_text(json.dumps({**gone, "sessionId": "e3efbc32-0000-4000-8000-000000000000"}))
    folder = tmp_path / "claude" / "projects" / "-w"
    folder.mkdir(parents=True)
    (folder / "e3efbc32-0000-4000-8000-000000000000.jsonl").write_text(
        json.dumps({"type": "continued-in", "continuedInSessionId": current}) + "\n"
    )
    assert ClaudeProcesses(tmp_path / "claude", proc=proc).former_remote_ids(pid) == ["cse_OLD"]
