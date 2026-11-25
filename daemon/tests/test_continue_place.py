"""Where a Remote Control session's conversation is on its machine (`continuing/place.py`): from Claude Code's
process file naming its bridge, its transcript, and whether a live process still has it open. Made-up files."""

import json
import os
from pathlib import Path

from muxtower.continuing.place import look
from muxtower.continuing.ports import Place
from muxtower.sessions.claude_processes import ClaudeProcesses

AGENT = "3c3c3c3c-0000-4000-8000-000000000001"


def _files(claude: Path, pid: int, transcript: bool = True) -> None:
    (claude / "sessions").mkdir(parents=True, exist_ok=True)
    (claude / "sessions" / f"{pid}.json").write_text(
        json.dumps({"pid": pid, "sessionId": AGENT, "cwd": "/work/shop", "bridgeSessionId": "session_X"})
    )
    if transcript:
        (claude / "projects" / "-work-shop").mkdir(parents=True, exist_ok=True)
        (claude / "projects" / "-work-shop" / f"{AGENT}.jsonl").write_text('{"type": "user", "uuid": "u1"}\n')


def test_found_by_its_bridge_while_its_app_has_it_open(tmp_path: Path) -> None:
    _files(tmp_path, os.getpid())  # a process that runs
    processes = ClaudeProcesses(tmp_path)
    assert look(processes, "cse_X", None) == Place(AGENT, "/work/shop", True, True)
    assert look(processes, "cse_OTHER", None) == Place(None, None, False, False)


def test_by_its_own_id_once_the_app_let_go(tmp_path: Path) -> None:
    _files(tmp_path, 2**22 + 12345)  # no such process
    processes = ClaudeProcesses(tmp_path)
    assert look(processes, None, AGENT) == Place(AGENT, None, True, False)
    assert look(processes, "cse_X", None).live is False


def test_without_its_transcript(tmp_path: Path) -> None:
    _files(tmp_path, os.getpid(), transcript=False)
    assert look(ClaudeProcesses(tmp_path), "cse_X", None) == Place(AGENT, "/work/shop", False, True)
