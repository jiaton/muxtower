"""Where a Remote Control session's conversation is on its machine (`continuing/place.py`): from Claude Code's
process file naming its bridge, its transcript, and whether a live process still has it open. Made-up files."""

import json
import os
from pathlib import Path

from muxtower.continuing.place import look
from muxtower.continuing.ports import Place
from muxtower.sessions.claude_processes import ClaudeProcesses

AGENT = "3c3c3c3c-0000-4000-8000-000000000001"


def _files(claude: Path, pid: int, transcript: bool = True, entrypoint: str = "claude-desktop") -> None:
    (claude / "sessions").mkdir(parents=True, exist_ok=True)
    (claude / "sessions" / f"{pid}.json").write_text(json.dumps({
        "pid": pid, "sessionId": AGENT, "cwd": "/work/shop", "bridgeSessionId": "session_X", "entrypoint": entrypoint,
    }))  # fmt: skip
    if transcript:
        (claude / "projects" / "-work-shop").mkdir(parents=True, exist_ok=True)
        (claude / "projects" / "-work-shop" / f"{AGENT}.jsonl").write_text('{"type": "user", "uuid": "u1"}\n')


def test_found_by_its_bridge_while_its_app_has_it_open(tmp_path: Path) -> None:
    _files(tmp_path, os.getpid())  # a process that runs
    processes = ClaudeProcesses(tmp_path)
    assert look(processes, "cse_X", None) == Place(AGENT, "/work/shop", True, True, "claude-desktop")
    assert look(processes, "cse_OTHER", None) == Place(None, None, False, False)


def test_by_its_own_id_once_the_app_let_go(tmp_path: Path) -> None:
    _files(tmp_path, 2**22 + 12345)  # no such process
    processes = ClaudeProcesses(tmp_path)
    assert look(processes, None, AGENT) == Place(AGENT, None, True, False)
    # No process has it open any more: still found by its bridge (the file stays), with no holder.
    assert look(processes, "cse_X", None) == Place(AGENT, "/work/shop", True, False, None)


def test_without_its_transcript(tmp_path: Path) -> None:
    _files(tmp_path, os.getpid(), transcript=False)
    assert look(ClaudeProcesses(tmp_path), "cse_X", None) == Place(AGENT, "/work/shop", False, True, "claude-desktop")


def test_a_terminal_s_claude_code_that_has_it_open_says_so(tmp_path: Path) -> None:
    _files(tmp_path, os.getpid(), entrypoint="cli")
    assert look(ClaudeProcesses(tmp_path), "cse_X", None).holder == "cli"
