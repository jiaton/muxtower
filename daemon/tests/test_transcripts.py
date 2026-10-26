import json
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.sessions.claude_processes import ClaudeProcesses
from muxtower.sessions.transcripts import TAILS, Transcripts
from tests import screens
from tests.fakes import FakeTmux
from tests.test_linking import FakeProcesses


def line(kind: str, text: str, **extra: Any) -> str:
    content = [{"type": "text", "text": text}]
    return json.dumps({"type": kind, "message": {"role": kind, "content": content}, **extra}) + "\n"


def test_reads_the_conversation_and_follows_what_is_appended(tmp_path: Path) -> None:
    path = tmp_path / "s.jsonl"
    path.write_text(
        line("user", "fix the build")
        + json.dumps({"type": "queue-operation"}) + "\n"
        + line("assistant", "sub-agent chatter", isSidechain=True)
        + line("user", "<injected>", isMeta=True)
        + line("assistant", "## Fixed\\n\\nAll green.")
    )  # fmt: skip
    transcripts = Transcripts()
    conversation = transcripts.conversation("s1", str(path), 0, 100)
    assert [(i.kind, i.text) for i in conversation.items] == [
        ("prompt", "fix the build"),
        ("reply", "## Fixed\\n\\nAll green."),
    ]

    assert transcripts.poll({"s1": str(path)}) == {}
    with path.open("a") as f:
        f.write(line("user", "now deploy"))
        f.write(line("assistant", "Deployed")[:20])  # half a line: wait for the rest
    (items,) = transcripts.poll({"s1": str(path)}).values()
    assert [i.text for i in items] == ["now deploy"]
    with path.open("a") as f:
        f.write(line("assistant", "Deployed")[20:])
    assert [i.text for i in transcripts.poll({"s1": str(path)})["s1"]] == ["Deployed"]
    assert transcripts.poll({}) == {}  # gone: no longer followed


def test_a_large_transcript_is_read_from_its_end_far_enough_back(tmp_path: Path) -> None:
    path = tmp_path / "big.jsonl"
    with path.open("w") as f:
        f.write(line("user", "the first prompt"))
        f.write(line("assistant", "y" * (TAILS[0] + 1000)))  # one huge event: the first tail is not enough
        f.write(line("assistant", "the latest"))
    items = Transcripts().conversation("s1", str(path), 0, 400).items
    assert [i.text for i in items][0] == "the first prompt" and items[-1].text == "the latest"


def test_a_pane_finds_its_transcript_through_the_process_file(tmp_path: Path) -> None:
    me = os.getpid()
    (tmp_path / "sessions").mkdir()
    (tmp_path / "sessions" / f"{me}.json").write_text(json.dumps({"cwd": "/srv/my.app", "sessionId": "abc"}))
    processes = ClaudeProcesses(tmp_path)
    assert processes.transcript(me) is None  # no file yet
    folder = tmp_path / "projects" / "-srv-my-app"
    folder.mkdir(parents=True)
    (folder / "abc.jsonl").write_text("")
    assert processes.transcript(me) == str(folder / "abc.jsonl")


def test_a_full_screen_session_offers_its_transcript(app: FastAPI, client: TestClient, auth: dict[str, str],
                                                     tmux: FakeTmux, tmp_path: Path) -> None:  # fmt: skip
    import dataclasses

    path = tmp_path / "t.jsonl"
    path.write_text(line("user", "hello") + line("assistant", "hi there"))
    pane = tmux.add_pane("default", "work", "claude")
    pane.info = dataclasses.replace(pane.info, pid=4242, alternate=True)
    pane.screen = screens.IDLE
    app.state.monitor.processes = FakeProcesses({}, {4242: str(path)})
    app.state.monitor.tick()
    (session,) = client.get("/v1/sessions", headers=auth).json()
    assert session["alt_screen"] is True and session["capabilities"]["conversation"] is True
    assert session["terminal_attached"] is False
    pane.info = dataclasses.replace(pane.info, attached=True)
    app.state.monitor.tick()
    assert client.get("/v1/sessions", headers=auth).json()[0]["terminal_attached"] is True
    conversation = client.get(f"/v1/sessions/{session['id']}/conversation", headers=auth).json()
    assert [i["text"] for i in conversation["items"]] == ["hello", "hi there"]
