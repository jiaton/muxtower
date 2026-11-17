"""An archived session started again: on its machine, in its folder (or another, when its own is gone), its
conversation resumed (Claude Code's where it went on last), under its own id, out of Archived; or, when it
cannot be, why not, said before it is tried."""

import json
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.config import RecoverySettings
from muxtower.recovery.service import RecoveryService
from muxtower.sessions.archive import SessionArchive
from muxtower.sessions.models import CreateSession, Session
from muxtower.sessions.ports import ArchiveRecord
from tests.fakes import FakeTmux

AGENT = "0f0e0d0c-0000-4000-8000-00000000abcd"
LATER = "1a1b1c1d-0000-4000-8000-00000000ef01"
THREAD = "019a0b0c-0d0e-7f00-8000-000000001234"


@pytest.fixture
def claude(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    home = tmp_path / "claude"
    (home / "projects" / "-w").mkdir(parents=True)
    (home / "sessions").mkdir()
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(home))
    return home


def _transcript(claude: Path, agent: str, then: str | None = None) -> Path:
    path = claude / "projects" / "-w" / f"{agent}.jsonl"
    lines = [{"type": "user", "message": {"role": "user", "content": "hi"}}]
    if then:
        lines.append({"type": "continued-in", "continuedInSessionId": then})
    path.write_text("".join(json.dumps(line) + "\n" for line in lines))
    return path


def _client(app: FastAPI) -> tuple[TestClient, dict[str, str]]:
    _, token = app.state.tokens.create("phone")
    return TestClient(app), {"Authorization": f"Bearer {token}"}


def _archived(app: FastAPI, folder: Path, runtime: str = "claude", agent: str | None = AGENT, *args: str) -> str:
    """A session muxtower started, with these options, archived (as the owner does)."""
    sessions = app.state.sessions
    made = sessions.create(CreateSession(runtime=runtime, cwd=str(folder), name="api", args=list(args)))
    record = sessions.repo.get(made.id)
    record.agent_id = agent
    sessions.repo.upsert(record)
    app.state.archiver.archive(made.id)
    return str(made.id)


def _listed(client: TestClient, auth: dict[str, str], session_id: str) -> dict[str, object]:
    return {s["id"]: s for s in client.get("/v1/sessions", headers=auth).json()}[session_id]  # type: ignore[no-any-return]


def _argv(tmux: FakeTmux) -> list[str]:
    return list(next(reversed(tmux.panes.values())).argv)


def test_an_archived_claude_session_starts_again_as_itself(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path, claude: Path
) -> None:
    _transcript(claude, AGENT)
    app = make_app()
    client, auth = _client(app)
    sid = _archived(app, tmp_path, "claude", AGENT, "--model", "opus")
    listed = _listed(client, auth, sid)
    assert listed["archived_at"] and listed["capabilities"]["resume"] and listed["resume_blocked"] is None  # type: ignore[index]

    res = client.post(f"/v1/sessions/{sid}/resume", headers=auth)
    assert res.status_code == 200 and res.json()["id"] == sid  # its own id: name, role, marks follow
    argv = _argv(tmux)
    assert argv[argv.index("--resume") + 1] == AGENT and "opus" in argv  # its conversation, its options
    again = _listed(client, auth, sid)
    assert again["archived_at"] is None and again["name"] == "api"  # out of Archived, as it was


def test_it_resumes_where_the_conversation_went_on(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path, claude: Path
) -> None:
    _transcript(claude, AGENT, then=LATER)
    _transcript(claude, LATER)
    app = make_app()
    client, auth = _client(app)
    sid = _archived(app, tmp_path)
    assert client.post(f"/v1/sessions/{sid}/resume", headers=auth).status_code == 200
    argv = _argv(tmux)
    assert argv[argv.index("--resume") + 1] == LATER


def test_an_archived_codex_session_resumes_its_thread(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path, claude: Path
) -> None:
    app = make_app()
    client, auth = _client(app)
    sid = _archived(app, tmp_path, "codex", THREAD)
    assert client.post(f"/v1/sessions/{sid}/resume", headers=auth).status_code == 200
    argv = _argv(tmux)
    assert argv[0] == "codex" and argv[argv.index("resume") + 1] == THREAD


def _old(app: FastAPI, folder: Path, sid: str = "abc123def456", **record: object) -> str:
    """An archived record from before what starts it again was kept: its view, and what else it had."""
    view = Session.model_validate(
        {
            "id": sid, "name": "old", "runtime": "claude-code", "cwd": str(folder), "source": "launched",
            "capabilities": {"screen": False, "conversation": False, "keys": [], "resize": False,
                             "terminate": True, "rename": False},
            "state": "idle", "state_source": "default", "needs_attention": False, "auto_approve": False,
            "matched_rule": None, "pending": None, "last_message": None,
            "can_auto_approve": False, "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }
    )  # fmt: skip
    store: SessionArchive = app.state.archiver.archive_store
    kept = {"remote_id": None, "transcript": None, "items": "[]", **record}
    store.repo.add(ArchiveRecord(sid, session=view.model_dump_json(), archived_at=datetime.now(UTC), **kept))  # type: ignore[arg-type]
    store._records = {r.session_id: r for r in store.repo.list()}
    return sid


def test_an_old_record_finds_its_conversation_by_its_transcript_or_its_remote_control_session(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path, claude: Path
) -> None:
    path = _transcript(claude, AGENT)
    app = make_app()
    client, auth = _client(app)
    sid = _old(app, tmp_path, transcript=str(path))
    assert client.post(f"/v1/sessions/{sid}/resume", headers=auth).status_code == 200
    assert AGENT in _argv(tmux)

    # No transcript kept, but its Remote Control session's process left the conversation's id behind.
    left = {"pid": 4242, "sessionId": AGENT, "bridgeSessionId": "session_x1"}
    (claude / "sessions" / "4242.json").write_text(json.dumps(left))
    sid = _old(app, tmp_path, "fed654cba321", remote_id="cse_x1")
    assert client.post(f"/v1/sessions/{sid}/resume", headers=auth).status_code == 200
    assert AGENT in _argv(tmux)


def test_what_cannot_be_started_again_says_why_before_it_is_tried(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path, claude: Path
) -> None:
    app = make_app()
    client, auth = _client(app)

    # Its transcript is gone.
    path = _transcript(claude, AGENT)
    sid = _archived(app, tmp_path)
    path.unlink()
    listed = _listed(client, auth, sid)
    assert not listed["capabilities"]["resume"] and listed["resume_blocked"]["code"] == "transcript"  # type: ignore[index]
    res = client.post(f"/v1/sessions/{sid}/resume", headers=auth)
    assert res.status_code == 409 and "transcript" in res.json()["detail"]

    # No id kept and nothing to find it by.
    sid = _old(app, tmp_path)
    assert _listed(client, auth, sid)["resume_blocked"]["code"] == "transcript"  # type: ignore[index]

    # Its folder is gone: another may be given.
    _transcript(claude, AGENT)
    folder = tmp_path / "gone"
    folder.mkdir()
    sid = _archived(app, folder)
    folder.rmdir()
    assert _listed(client, auth, sid)["resume_blocked"]["code"] == "folder"  # type: ignore[index]
    assert client.post(f"/v1/sessions/{sid}/resume", headers=auth).status_code == 409
    other = tmp_path / "elsewhere"
    other.mkdir()
    res = client.post(f"/v1/sessions/{sid}/resume", json={"cwd": str(other)}, headers=auth)
    assert res.status_code == 200 and res.json()["cwd"] == str(other)

    # One muxtower never ran (Claude's app, Remote Control only).
    sid = _old(app, tmp_path)
    store: SessionArchive = app.state.archiver.archive_store
    record = store.record(sid)
    assert record is not None
    view = Session.model_validate_json(record.session).model_copy(update={"source": "remote_control"})
    store.keep(view, None, [])
    assert _listed(client, auth, sid)["resume_blocked"]["code"] == "not_ours"  # type: ignore[index]
    assert client.post(f"/v1/sessions/{sid}/resume", headers=auth).status_code == 409


def test_a_node_s_session_is_started_again_on_its_node_unless_it_is_offline(tmp_path: Path) -> None:
    class Repo:
        rows: dict[str, ArchiveRecord] = {}

        def list(self) -> list[ArchiveRecord]:
            return list(self.rows.values())

        def add(self, record: ArchiveRecord) -> None:
            self.rows[record.session_id] = record

        def delete(self, session_id: str) -> None:
            self.rows.pop(session_id, None)

    archive = SessionArchive(Repo())  # type: ignore[arg-type]
    view = Session.model_validate(
        {
            "id": "mac~abc123", "name": "w", "runtime": "claude-code", "cwd": "/Users/me/w", "source": "launched",
            "node": "mac", "capabilities": {"screen": False, "conversation": False, "keys": [], "resize": False,
                                            "terminate": True, "rename": False},
            "state": "idle", "state_source": "default", "needs_attention": False, "auto_approve": False,
            "matched_rule": None, "pending": None, "last_message": None,
            "can_auto_approve": False, "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }
    )  # fmt: skip
    archive.keep(view, None, [])
    recovery = RecoveryService(None, RecoverySettings(), archive=archive)  # type: ignore[arg-type]
    asked: list[tuple[str, str, str | None]] = []
    online = {"mac": False}
    recovery.node_online = lambda name: online[name]
    recovery.ask_node_resume = lambda node, sid, cwd: asked.append((node, sid, cwd)) or view  # type: ignore[func-returns-value]

    shown = archive.get("mac~abc123")
    assert shown is not None and shown.resume_blocked is not None and shown.resume_blocked.code == "offline"
    with pytest.raises(Exception, match="offline"):
        recovery.resume("mac~abc123")
    online["mac"] = True
    assert archive.get("mac~abc123").capabilities.resume  # type: ignore[union-attr]
    recovery.resume("mac~abc123")
    assert asked == [("mac", "abc123", None)]  # asked of its node, by its id there
    assert archive.get("mac~abc123") is None  # out of Archived here too


def test_start_session_resumes_an_archived_session_by_its_muxtower_id(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path, claude: Path
) -> None:
    from muxtower.mcp.session_tools import StartArgs

    _transcript(claude, AGENT)
    app = make_app()
    sid = _archived(app, tmp_path)
    text = app.state.mcp.session_tools.start_session(StartArgs(resume=sid))
    assert f"({sid}) again" in text
    argv = _argv(tmux)
    assert argv[argv.index("--resume") + 1] == AGENT
    assert app.state.directory.get(sid).archived_at is None
