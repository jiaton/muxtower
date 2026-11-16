"""A session a restart interrupted (its recovery failed) is archived, not forgotten: DELETE archives it with
its history (its transcript, found by its conversation's own id), and only then can it be deleted."""

import json
from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.sessions.models import CreateSession

AGENT = "0f0e0d0c-0000-4000-8000-00000000abcd"


def test_deleting_an_interrupted_session_archives_it_with_its_transcript(
    make_app: Callable[..., FastAPI], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    claude = tmp_path / "claude"
    folder = claude / "projects" / "-w"
    folder.mkdir(parents=True)
    transcript = folder / f"{AGENT}.jsonl"
    transcript.write_text(json.dumps({"type": "user", "message": {"role": "user", "content": "hi"}}) + "\n")
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(claude))
    app = make_app()
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}
    sessions = app.state.sessions
    session = sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="api"))
    record = sessions.repo.get(session.id)
    record.agent_id = AGENT
    sessions.interrupt(record)  # the machine restarted under it, and it was not started again

    client = TestClient(app)
    assert client.delete(f"/v1/sessions/{session.id}", headers=auth).status_code == 204
    listed = {s["id"]: s for s in client.get("/v1/sessions", headers=auth).json()}
    assert listed[session.id]["archived_at"]  # archived, not forgotten
    assert app.state.archiver.archive_store.repo.list()[0].transcript == str(transcript)  # its history kept
    # Delete is for an archived session: muxtower's copy goes, the transcript on disk stays.
    assert client.delete(f"/v1/sessions/{session.id}", headers=auth).status_code == 204
    assert session.id not in {s["id"] for s in client.get("/v1/sessions", headers=auth).json()}
    assert transcript.exists()
