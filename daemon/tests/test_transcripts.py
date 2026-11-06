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


def test_the_transcript_its_hooks_name_wins_when_written_to_last(app: FastAPI, client: TestClient,
                                                                  auth: dict[str, str], tmux: FakeTmux,
                                                                  tmp_path: Path) -> None:  # fmt: skip
    """The process file can be left naming a transcript Claude Code no longer writes to."""
    import dataclasses

    left, now = tmp_path / "left.jsonl", tmp_path / "now.jsonl"
    left.write_text(line("user", "old") + line("assistant", "stuck here"))
    now.write_text(line("user", "old") + line("assistant", "and on"))
    os.utime(left, (1_000, 1_000))
    pane = tmux.add_pane("default", "work", "claude")
    pane.info = dataclasses.replace(pane.info, pid=4242, alternate=True)
    pane.screen = screens.IDLE
    app.state.monitor.processes = FakeProcesses({}, {4242: str(left)})
    app.state.monitor.tick()
    (session,) = client.get("/v1/sessions", headers=auth).json()
    app.state.sessions.live_of(session["id"]).hook_transcript = str(now)  # as a hook said
    app.state.monitor.tick()
    items = client.get(f"/v1/sessions/{session['id']}/conversation", headers=auth).json()["items"]
    assert items[-1]["text"] == "and on"
    os.utime(now, (1_000, 1_000))  # and when the process file names one written to since, that one
    os.utime(left, None)
    app.state.monitor.tick()
    items = client.get(f"/v1/sessions/{session['id']}/conversation", headers=auth).json()["items"]
    assert items[-1]["text"] == "stuck here"


def test_a_transcript_that_says_it_went_on_elsewhere_is_followed_there(tmp_path: Path) -> None:
    """Claude Code moved the conversation (a job, another folder) and left the process file behind."""
    from muxtower.sessions.claude_processes import continued

    first, job, now = (
        "376afc00-a76b-462b-a5b3-41179efb8e49",
        "9df33ad1-0b2b-4dcf-9825-dbda6e3183af",
        "93a0d3fc-1e27-4466-a8d8-96a0fce56a08",
    )
    (tmp_path / "-Users-me-Documents").mkdir()
    (tmp_path / "-Users-me-Documents-quant").mkdir()

    def went_on(to: str) -> str:
        return json.dumps({"type": "continued-in", "continuedInSessionId": to, "sessionId": "x"}) + "\n"

    (tmp_path / "-Users-me-Documents" / f"{first}.jsonl").write_text(line("user", "hi") + went_on(job))
    (tmp_path / "-Users-me-Documents" / f"{job}.jsonl").write_text(line("user", "on") + went_on(now))
    (tmp_path / "-Users-me-Documents-quant" / f"{now}.jsonl").write_text(line("user", "here now"))
    assert continued(tmp_path / "-Users-me-Documents" / f"{first}.jsonl", tmp_path).endswith(f"-quant/{now}.jsonl")
    plain = tmp_path / "-Users-me-Documents" / "plain.jsonl"
    plain.write_text(line("user", "nothing moved"))
    assert continued(plain, tmp_path) == str(plain)


def test_an_unreadable_transcript_is_told_of_once_an_hour_not_each_read(tmp_path: Path, caplog: Any) -> None:
    from muxtower.sessions import transcripts as module

    path = tmp_path / "gone.jsonl"
    followed = module._Followed(str(path))
    reader = Transcripts.__new__(Transcripts)
    for _ in range(5):
        assert reader._read(followed) == []
    assert sum("cannot read transcript" in r.message for r in caplog.records) == 1
    followed.warned -= module.WARN_EVERY  # an hour on
    reader._read(followed)
    assert sum("cannot read transcript" in r.message for r in caplog.records) == 2
