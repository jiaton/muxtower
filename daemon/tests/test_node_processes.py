"""The hub's own Remote Control sessions that run on a node are listed as that computer's, from what the
node says of its processes (it lists none of them itself)."""

from pathlib import Path

from fastapi.testclient import TestClient

from muxtower.app import create_app
from muxtower.config import load_settings
from muxtower.nodes.processes import platform_of, report
from muxtower.nodes.protocol import PROTOCOL, Hello
from muxtower.sessions.claude_processes import ClaudeProcess
from muxtower.sources.remote_control.ports import RawEvent
from muxtower.sources.remote_control.service import RemoteControlSource
from tests.fakes import FakeTmux
from tests.rc_fakes import FakeRemoteControl, session


def _in(seq: int, cwd: str) -> RawEvent:
    return RawEvent(seq, None, "worker", {"type": "system", "subtype": "vcs_state_changed", "cwd": cwd})


def test_a_session_whose_process_runs_on_a_node_is_that_node_s(tmp_path: Path) -> None:
    port = FakeRemoteControl()
    # The desktop app's sessions name no environment (no machine).
    port.sessions = [session(sid, environment_id=None) for sid in ("cse_live", "cse_old", "cse_placed", "cse_nas")]
    port.events = {"cse_live": [_in(1, "/Users/me/work")], "cse_old": [_in(1, "/Users/me/old")]}
    source = RemoteControlSource(port, {})
    source.tick()
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"name": "nas", "state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False},
    )  # fmt: skip
    app = create_app(settings, tmux=FakeTmux(), run_loops=False, remote_control=source)
    nodes = app.state.nodes
    name, _ = nodes.claim("mac")
    _, token = app.state.tokens.create("phone")
    phone = TestClient(app, headers={"Authorization": f"Bearer {token}"})
    assert phone.put("/v1/sessions/cse_placed/placement", json={"machine": "Mac"}).status_code == 200

    def machines() -> dict[str, tuple[str | None, bool]]:
        return {s["id"]: (s["machine"], s["on_host"]) for s in phone.get("/v1/sessions").json()}

    # The Mac's Claude runs cse_live; it says so, and which kind of machine it is.
    running = {"cse_live": ClaudeProcess(pid=7, cwd="/Users/me/work/sub", entrypoint="claude-desktop")}
    nodes.on_event(name, "running", report(running))
    nodes.node(name).record.platform = Hello(protocol=PROTOCOL, name="mac", version="1", platform="darwin").platform
    listed = machines()
    assert listed["cse_live"] == ("mac", False)  # its process is there; Remote Control here still lists it
    assert listed["cse_old"] == ("mac", False)  # not running, but in a Mac folder, and there is one Mac
    assert listed["cse_placed"] == ("mac", False)  # the owner's "Mac" is the node "mac"
    assert listed["cse_nas"] == (None, False)  # nothing says where
    live = phone.get("/v1/sessions/cse_live").json()
    assert live["cwd"] == "/Users/me/work/sub" and live["origin"] == "claude_code_claude_desktop"

    # What a node reports is its own machine's only, and a Windows folder is told apart.
    assert report({"x": ClaudeProcess(pid=1, cwd="/", machine="other")}) == []
    assert platform_of("C:\\Users\\me") == "win32" and platform_of("/home/me") is None


def test_a_desktop_session_on_a_node_says_where_it_sits_in_git(tmp_path: Path) -> None:
    """The hub cannot run git on the node's folders: the node reads them with what it reports."""
    from muxtower.teams.ports import Checkout

    port = FakeRemoteControl()
    port.sessions = [session("cse_wt", environment_id=None), session("cse_plain", environment_id=None)]
    source = RemoteControlSource(port, {})
    source.tick()
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"name": "nas", "state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False},
    )  # fmt: skip
    app = create_app(settings, tmux=FakeTmux(), run_loops=False, remote_control=source)
    name, _ = app.state.nodes.claim("mac")
    _, token = app.state.tokens.create("phone")
    phone = TestClient(app, headers={"Authorization": f"Bearer {token}"})

    # What the Mac reads of its folders (its git): a worktree of a repository, and a folder outside git.
    wt, repo = "/Users/me/shop-teams", "/Users/me/shop"
    folders = {
        wt: Checkout("acme/shop", "git remote", wt, "teams", repo, "acme/shop"),
        "/Users/me/notes": Checkout("notes", "folder"),
    }
    running = {
        "cse_wt": ClaudeProcess(pid=7, cwd="/Users/me/shop-teams", entrypoint="claude-desktop"),
        "cse_plain": ClaudeProcess(pid=8, cwd="/Users/me/notes", entrypoint="claude-desktop"),
    }
    told = report(running, folders.__getitem__)
    assert told[1]["git"] == {
        "repo": "/Users/me/shop",
        "worktree": "/Users/me/shop-teams",
        "branch": "teams",
        "remote": "acme/shop",
    }
    app.state.nodes.on_event(name, "running", told)
    listed = {s["id"]: s for s in phone.get("/v1/sessions").json()}
    assert listed["cse_wt"]["machine"] == "mac" and listed["cse_wt"]["git"]["worktree"] == "/Users/me/shop-teams"
    assert listed["cse_plain"]["git"] is None
    app.state.nodes.on_event(name, "running", [{"remote_id": "cse_wt", "cwd": "/Users/me/shop-teams"}])  # an older node
    assert next(s for s in phone.get("/v1/sessions").json() if s["id"] == "cse_wt")["git"] is None
