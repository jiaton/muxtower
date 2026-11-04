"""Without /proc (macOS), process facts come from `ps` and `lsof`, slow enough that each tick asking for
every pane, several times over, held the capture loop half a second: their answers are kept a while."""

import subprocess
from pathlib import Path
from typing import Any

import pytest

from muxtower.infra import procfs


def test_the_tools_are_asked_once_a_while_not_once_a_question(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[list[str]] = []

    def run(argv: list[str], **_: Any) -> subprocess.CompletedProcess[str]:
        calls.append(argv)
        out = {"ps": "1 0\n10 1\n11 10\n", "lsof": "p11\nn/Users/me/work\n"}[argv[0]]
        if argv[:2] == ["ps", "-o"]:
            out = "claude --resume x"
        return subprocess.CompletedProcess(argv, 0, out, "")

    monkeypatch.setattr(procfs.subprocess, "run", run)
    monkeypatch.setattr(procfs, "_known", {})
    no_proc = tmp_path / "none"
    for _ in range(3):  # a tick asks this for every pane, three times (remote id, transcript, name)
        assert list(procfs.family(10, procfs.Children(no_proc), 3)) == [10, 11]
        assert procfs.argv_of(11, no_proc) == ["claude", "--resume", "x"]
        assert procfs.cwd_of(11, no_proc) == "/Users/me/work"
        assert procfs.open_files([11, 10], no_proc) == ["/Users/me/work"]
    assert [c[:2] for c in calls] == [["ps", "-Ao"], ["ps", "-o"], ["lsof", "-a"], ["lsof", "-Fn"]]

    monkeypatch.setattr(procfs.time, "monotonic", lambda: 1e9)  # a while later: asked again
    procfs.argv_of(11, no_proc)
    assert len(calls) == 5


def test_the_mac_kernel_s_structures_are_read_as_laid_out() -> None:
    import struct

    from muxtower.infra import libproc as lp

    bsd = bytearray(lp.BSDINFO_SIZE)
    struct.pack_into("<I", bsd, 12, 4242)  # pid
    struct.pack_into("<I", bsd, 16, 1)  # parent
    bsd[48:54] = b"claude"
    struct.pack_into("<QQ", bsd, 120, 1_762_000_000, 500_000)
    assert lp.bsd_fields(bytes(bsd)) == (1, "claude", 1_762_000_000.5)
    assert lp.bsd_fields(bytes(bsd[:-8])) is None  # not the layout this knows: not trusted

    task = bytearray(lp.TASKINFO_SIZE)
    struct.pack_into("<QQQQ", task, 0, 1 << 33, 120 * 1048576, 3_000, 1_000)
    struct.pack_into("<i", task, 84, 17)
    assert lp.task_fields(bytes(task)) == (120 * 1048576, 4_000, 17)

    args = struct.pack("<i", 3) + b"/usr/local/bin/claude\0\0\0\0claude\0--resume\0abc\0PATH=/usr/bin\0"
    assert lp.procargs(args) == ["claude", "--resume", "abc"]
    assert lp.procargs(b"\0") is None

    vnode = bytearray(lp.VNODEPATHINFO_SIZE)
    vnode[lp.VNODE_INFO_SIZE : lp.VNODE_INFO_SIZE + 15] = b"/Users/me/work\0"
    assert lp.path_at(bytes(vnode), lp.VNODE_INFO_SIZE) == "/Users/me/work"
    assert lp.libproc() is None  # this is no Mac


def test_on_a_mac_the_kernel_answers_and_no_tool_runs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    class Kernel:
        def parents(self) -> list[tuple[int, int]]:
            return [(10, 1), (11, 10)]

        def argv(self, pid: int) -> list[str] | None:
            return ["claude"] if pid == 11 else None

        def cwd(self, pid: int) -> str:
            return "/Users/me/work"

        def started(self, pid: int) -> float:
            return 1.0

        def open_files(self, pid: int) -> list[str]:
            return ["/Users/me/.codex/sessions/x.jsonl"]

        def pids(self) -> list[int]:
            return [10, 11]

    def no_tools(*_: Any, **__: Any) -> None:
        raise AssertionError("no ps or lsof on a Mac with the kernel's calls")

    monkeypatch.setattr(procfs, "libproc", lambda: Kernel())
    monkeypatch.setattr(procfs.subprocess, "run", no_tools)
    monkeypatch.setattr(procfs, "_known", {})
    no_proc = tmp_path / "none"
    assert list(procfs.family(10, procfs.Children(no_proc), 3)) == [10, 11]
    assert procfs.argv_of(11, no_proc) == ["claude"]
    assert procfs.cwd_of(11, no_proc) == "/Users/me/work"
    assert procfs.started_at(11, no_proc) == 1.0
    assert procfs.open_files([10, 11], no_proc) == ["/Users/me/.codex/sessions/x.jsonl"] * 2
    assert procfs.all_commands(no_proc) == {11: ["claude"]}


def test_when_the_kernel_will_not_tell_the_tools_still_do(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    class Silent:
        def __getattr__(self, _: str) -> Any:
            return lambda *a: None

    def run(argv: list[str], **_: Any) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(argv, 0, "p11\nn/Users/me/work\n", "")

    monkeypatch.setattr(procfs, "libproc", lambda: Silent())
    monkeypatch.setattr(procfs.subprocess, "run", run)
    monkeypatch.setattr(procfs, "_known", {})
    assert procfs.cwd_of(11, tmp_path / "none") == "/Users/me/work"
