"""The session list keeps what does not change (archived views, whether one can be started again, Claude
Code's files) and shows what does at once: a session archived or started again, a transcript gone or come,
a process file rewritten."""

import json
import os
import threading
import time
from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi import FastAPI

from muxtower.sessions.claude_files import ProcessFiles, TranscriptIndex
from muxtower.sessions.claude_processes import ClaudeProcesses
from muxtower.sessions.models import CreateSession
from tests.fakes import FakeTmux

AGENT = "0f0e0d0c-0000-4000-8000-00000000abcd"
LATER = "1a1b1c1d-0000-4000-8000-00000000ef01"


@pytest.fixture
def claude(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    home = tmp_path / "claude"
    (home / "projects" / "-w").mkdir(parents=True)
    (home / "sessions").mkdir()
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(home))
    return home


def _transcript(claude: Path, agent: str, folder: str = "-w", then: str | None = None) -> Path:
    path = claude / "projects" / folder / f"{agent}.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [{"type": "user", "message": {"role": "user", "content": "Plan the launch"}}]
    if then:
        lines.append({"type": "continued-in", "continuedInSessionId": then})
    path.write_text("".join(json.dumps(line) + "\n" for line in lines))
    return path


def _archived(app: FastAPI, folder: Path, agent: str = AGENT) -> str:
    sessions = app.state.sessions
    made = sessions.create(CreateSession(runtime="claude", cwd=str(folder), name="api"))
    record = sessions.repo.get(made.id)
    record.agent_id = agent
    sessions.repo.upsert(record)
    app.state.archiver.archive(made.id)
    return str(made.id)


def _listed(app: FastAPI, session_id: str) -> dict[str, object] | None:
    found = {s.id: s for s in app.state.directory.list()}.get(session_id)
    return found.model_dump(mode="json") if found else None


def _age(*paths: Path, seconds: float = 60) -> None:
    """Changed `seconds` ago (what changed just now is read again each time: `claude_files.SETTLE_NS`), and
    so is everything in a folder given."""
    at = time.time_ns() - int(seconds * 1e9)
    for path in paths:
        for p in [path, *(path.rglob("*") if path.is_dir() else [])]:
            os.utime(p, ns=(at, at))


# --- Claude Code's files -------------------------------------------------------------------------


def test_the_transcript_index_sees_a_transcript_come_go_and_go_on(claude: Path) -> None:
    index = TranscriptIndex(claude / "projects")
    assert index.find(AGENT) is None
    path = _transcript(claude, AGENT, folder="-elsewhere")  # a folder that was not there
    index.stamp()  # read now
    assert index.find(AGENT) == path
    assert index.continued_in(path) is None

    # Rewritten in place with a `continued-in`: read again, by its own stamp.
    _age(path)
    assert index.continued_in(path) is None
    _transcript(claude, AGENT, folder="-elsewhere", then=LATER)
    assert index.continued_in(path) == LATER

    path.unlink()
    index.stamp()
    assert index.find(AGENT) is None


def test_process_files_are_read_again_only_when_they_change(claude: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    files = ProcessFiles(claude / "sessions")
    file = claude / "sessions" / "4242.json"
    file.write_text(json.dumps({"pid": 4242, "sessionId": AGENT, "bridgeSessionId": "session_x1"}))
    assert [info["sessionId"] for _, info in files.read()] == [AGENT]  # read, though not kept while just written
    _age(file)
    files.read()

    reads = 0
    real = Path.read_text

    def counted(self: Path, *args: object, **kwargs: object) -> str:
        nonlocal reads
        reads += 1
        return real(self, *args, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(Path, "read_text", counted)
    files.read()
    assert files.get("4242.json") is not None and reads == 0  # unchanged: parsed once

    file.write_text(json.dumps({"pid": 4242, "sessionId": LATER, "bridgeSessionId": "session_x1"}))
    _age(file, seconds=30)  # rewritten in place, its size the same: its mtime tells
    assert [info["sessionId"] for _, info in files.read()] == [LATER] and reads == 1
    file.unlink()
    assert files.read() == [] and files.get("4242.json") is None


def test_a_remote_control_session_s_conversation_follows_its_process_file(claude: Path) -> None:
    processes = ClaudeProcesses(claude)
    file = claude / "sessions" / "4242.json"
    assert processes.agent_for_remote("cse_x1") is None
    file.write_text(json.dumps({"pid": 4242, "sessionId": AGENT, "bridgeSessionId": "session_x1"}))
    assert processes.agent_for_remote("cse_x1") == AGENT
    _age(claude)
    assert processes.agent_for_remote("cse_x1") == AGENT
    file.write_text(json.dumps({"pid": 4242, "sessionId": LATER, "bridgeSessionId": "session_x1"}))
    assert processes.agent_for_remote("cse_x1") == LATER


# --- archived sessions ---------------------------------------------------------------------------


def test_archived_and_started_again_show_at_once(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path, claude: Path
) -> None:
    _transcript(claude, AGENT)
    app = make_app()
    sessions = app.state.sessions
    made = sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="api"))
    record = sessions.repo.get(made.id)
    record.agent_id = AGENT
    sessions.repo.upsert(record)
    assert (_listed(app, made.id) or {})["archived_at"] is None
    app.state.archiver.archive(made.id)
    listed = _listed(app, made.id) or {}
    assert listed["archived_at"] and listed["resume_blocked"] is None  # listed archived at once

    app.state.recovery.resume(made.id)
    assert (_listed(app, made.id) or {})["archived_at"] is None  # out of Archived at once
    app.state.archiver.archive(made.id)
    assert (_listed(app, made.id) or {})["archived_at"]  # and back in


def test_whether_it_can_be_started_again_is_kept_until_its_files_change(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path, claude: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = _transcript(claude, AGENT)
    app = make_app()
    sid = _archived(app, tmp_path)
    looked = 0
    processes = app.state.recovery.processes
    real = processes.transcript_for

    def counted(agent: str) -> str | None:
        nonlocal looked
        looked += 1
        return real(agent)  # type: ignore[no-any-return]

    monkeypatch.setattr(processes, "transcript_for", counted)
    _age(claude, tmp_path)
    assert (_listed(app, sid) or {})["resume_blocked"] is None
    first = looked
    for _ in range(3):
        assert (_listed(app, sid) or {})["resume_blocked"] is None
    assert looked == first  # nothing changed: not looked for again

    path.unlink()  # its transcript gone: said at once (its folder changed)
    assert (_listed(app, sid) or {})["resume_blocked"]["code"] == "transcript"  # type: ignore[index]
    assert looked > first
    _transcript(claude, AGENT)  # back, within the same tick of the clock: its folder's mtime may be the same
    assert (_listed(app, sid) or {})["resume_blocked"] is None


def test_a_record_changed_is_viewed_again(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path, claude: Path
) -> None:
    _transcript(claude, AGENT)
    app = make_app()
    sid = _archived(app, tmp_path)
    assert (_listed(app, sid) or {})["fork_of"] is None
    app.state.archiver.archive_store.place(sid, "parent123456")
    assert (_listed(app, sid) or {})["fork_of"] == "parent123456"


# --- the list itself ------------------------------------------------------------------------------


def test_callers_waiting_on_a_list_share_it_and_one_asked_later_gets_a_new_one(
    make_app: Callable[..., FastAPI], monkeypatch: pytest.MonkeyPatch
) -> None:
    directory = make_app().state.directory
    made, release = 0, threading.Event()
    real = directory._list

    def slow() -> list[object]:
        nonlocal made
        made += 1
        release.wait(5)
        return real()  # type: ignore[no-any-return]

    monkeypatch.setattr(directory, "_list", slow)
    threads = [threading.Thread(target=directory.list) for _ in range(4)]
    for t in threads:
        t.start()
        time.sleep(0.02)
    release.set()
    for t in threads:
        t.join()
    assert made == 2  # the first, and one for all that asked while it was being made
    directory.list()
    assert made == 3  # asked after: never an answer from before
    directory.recent(60)
    assert made == 3  # one a little old will do
