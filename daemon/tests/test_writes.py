"""Two sessions writing in one worktree at once see each other: counted only from file-editing tools,
in the real worktree a path resolves to, recent writes of running sessions only. A hint that never moves
a session or changes its project."""

import subprocess
import time
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.writes.tracker import WriteTracker, written_paths
from tests.fakes import FakeTmux


def _git(cwd: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(cwd), *args], check=True, capture_output=True)  # noqa: S603, S607


@pytest.fixture
def shop(tmp_path: Path) -> Path:
    repo = tmp_path / "shop"
    repo.mkdir()
    _git(repo, "init", "-q", "-b", "main")
    _git(repo, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty", "-m", "x")
    _git(repo, "worktree", "add", "-q", "-b", "fix", str(tmp_path / "shop-fix"))
    return repo


def _edit(path: Path) -> dict[str, str]:
    return {"file_path": str(path)}


def test_only_file_editing_tools_count_never_bash() -> None:
    assert written_paths("Edit", {"file_path": "/r/a.py"}, "/r") == ["/r/a.py"]
    assert written_paths("NotebookEdit", {"notebook_path": "n.ipynb"}, "/r") == ["/r/n.ipynb"]
    patch = "*** Begin Patch\n*** Update File: src/x.py\n@@\n*** Add File: y.md\n*** End Patch"
    assert written_paths("apply_patch", {"input": patch}, "/r") == ["/r/src/x.py", "/r/y.md"]
    assert written_paths("Bash", {"command": "echo hi > a.py"}, "/r") == []  # a known blind spot
    assert written_paths("Read", {"file_path": "/r/a.py"}, "/r") == []


def test_two_writers_in_one_worktree_see_each_other_and_the_files_both_changed(shop: Path) -> None:
    writes = WriteTracker(lambda: 30)
    writes.record("a", "Edit", _edit(shop / "app.py"), str(shop))
    writes.record("a", "Write", _edit(shop / "new" / "notes.md"), str(shop))  # a folder not made yet
    writes.record("b", "Edit", _edit(shop / "app.py"), str(shop))
    writes.record("b", "Edit", _edit(shop / "other.py"), str(shop))
    found = writes.conflicts({"a", "b"})
    (a,) = found["a"]
    assert (a.worktree, a.others, a.files) == (str(shop), ("b",), ("app.py",))
    assert found["b"][0].others == ("a",)


def test_a_reader_and_a_writer_do_not_and_neither_do_two_worktrees(shop: Path, tmp_path: Path) -> None:
    writes = WriteTracker(lambda: 30)
    writes.record("writer", "Edit", _edit(shop / "app.py"), str(shop))
    writes.record("reader", "Read", _edit(shop / "app.py"), str(shop))  # reads, in the same checkout
    writes.record("reader", "Bash", {"command": "make"}, str(shop))
    assert writes.conflicts({"writer", "reader"}) == {}
    writes.record("other", "Edit", _edit(tmp_path / "shop-fix" / "app.py"), str(tmp_path / "shop-fix"))
    assert writes.conflicts({"writer", "other"}) == {}  # another worktree of it: parallel, as it should be


def test_a_write_through_a_symlink_counts_where_the_file_really_is(shop: Path, tmp_path: Path) -> None:
    (tmp_path / "configs").mkdir()
    (tmp_path / "configs" / "app.yaml").symlink_to(shop / "app.yaml")
    writes = WriteTracker(lambda: 30)
    writes.record("a", "Edit", _edit(tmp_path / "configs" / "app.yaml"), str(tmp_path))
    writes.record("b", "Edit", _edit(shop / "app.yaml"), str(shop))
    assert writes.conflicts({"a", "b"})["a"][0].files == ("app.yaml",)


def test_files_outside_git_and_old_or_ended_writers_do_not_count(shop: Path, tmp_path: Path) -> None:
    window = [30.0]
    writes = WriteTracker(lambda: window[0])
    writes.record("a", "Write", _edit(tmp_path / "scratch" / "x.txt"), str(tmp_path))  # not in git
    writes.record("b", "Write", _edit(tmp_path / "scratch" / "x.txt"), str(tmp_path))
    assert writes.conflicts({"a", "b"}) == {}
    writes.record("a", "Edit", _edit(shop / "app.py"), str(shop))
    writes.record("b", "Edit", _edit(shop / "app.py"), str(shop))
    assert writes.conflicts({"a"}) == {}  # b is not running
    time.sleep(0.05)
    window[0] = 0.0005  # 30 ms: both writes are older
    assert writes.conflicts({"a", "b"}) == {}
    window[0] = 30
    writes.forget("b")
    assert writes.conflicts({"a", "b"}) == {}


def test_the_list_and_my_team_say_it_and_nothing_else_moves(
    app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux, shop: Path
) -> None:
    ids, tokens = [], []
    for name in ("one", "two"):
        made = client.post("/v1/sessions", json={"runtime": "claude", "cwd": str(shop), "name": name}, headers=auth)
        ids.append(made.json()["id"])
        tokens.append(next(p for p in tmux.panes.values() if p.env["MUXTOWER_SESSION_ID"] == ids[-1]).env)
    before = {s["id"]: s for s in client.get("/v1/sessions", headers=auth).json()}
    for sid, env in zip(ids, tokens, strict=True):
        body = {"hook_event_name": "PostToolUse", "tool_name": "Edit", "tool_input": _edit(shop / "app.py")}
        headers = {"Authorization": f"Bearer {env['MUXTOWER_HOOK_TOKEN']}", "X-Muxtower-Session": sid}
        assert client.post("/v1/hooks/claude-code", json=body, headers=headers).status_code == 200
    time.sleep(1.1)  # past the listing's one-second snapshot
    listed = {s["id"]: s for s in client.get("/v1/sessions", headers=auth).json()}
    (seen,) = listed[ids[0]]["also_writing"]
    assert (seen["session_id"], seen["name"], seen["files"]) == (ids[1], "two", ["app.py"])
    for sid in ids:  # a hint only: where it is listed and its project stay as they were
        for key in ("cwd", "project", "project_auto", "team_role", "git"):
            assert listed[sid][key] == before[sid][key], key

    from tests.test_teams import _tool

    team = _tool(client, tokens[0]["MUXTOWER_MCP_TOKEN"], "my_team")
    assert f"also writing in {shop}: two ({ids[1]}) · both changed app.py" in team
