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
