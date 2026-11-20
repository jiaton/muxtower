"""A Remote Control session on its own that an earlier run of a live tmux session's conversation used (from
before its bridges were recorded, its process file gone) is folded into that session, found by the
conversation itself: its first message is the first of that conversation's transcript."""

import dataclasses
import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from muxtower.app import create_app
from muxtower.config import load_settings
from muxtower.sessions.claude_processes import ClaudeProcess, ClaudeProcesses
from muxtower.sessions.former_bridges import FormerBridges
from muxtower.sessions.monitor import Monitor
from muxtower.sources.remote_control.ports import RawEvent
from muxtower.sources.remote_control.service import RemoteControlSource
from tests.fakes import FakeTmux
from tests.rc_fakes import FakeRemoteControl, session

OLD = "0a0a0a0a-0000-4000-8000-000000000001"  # the conversation the orphan bridge carried
NOW = "0b0b0b0b-0000-4000-8000-000000000002"  # where it went on: the pane's transcript now
FIRST = "f1f1f1f1-0000-4000-8000-000000000001"  # the conversation's first message
LATER = "f2f2f2f2-0000-4000-8000-000000000002"
ELSE = "f9f9f9f9-0000-4000-8000-000000000009"


def _line(**entry: Any) -> str:
    return json.dumps(entry) + "\n"


def _events(first: str, at: str) -> list[RawEvent]:
    """A bridge's log: the conversation's messages, under their own ids."""
    return [
        RawEvent(1, at, "client", {"type": "user", "uuid": first, "message": {"role": "user", "content": "plan it"}}),
        RawEvent(2, at.replace(":00Z", ":30Z"), "worker", {
            "type": "assistant", "uuid": LATER,
            "message": {"role": "assistant", "content": [{"type": "text", "text": "ok"}]},
        }),
    ]  # fmt: skip


class Panes:
    """The pane's Claude Code, running without Remote Control, writing to `transcript`."""

    def __init__(self, transcripts: dict[int, str]) -> None:
        self.transcripts = transcripts

    def remote_id(self, pane_pid: int, screen: str = "") -> str | None:
        return None

    def transcript(self, pane_pid: int, screen: str = "") -> str | None:
        return self.transcripts.get(pane_pid)

    def name(self, pane_pid: int, screen: str = "") -> str | None:
        return None

    def running(self) -> dict[str, ClaudeProcess]:
        return {}


def _setup(tmp_path: Path, pane_transcript: Path) -> tuple[Any, RemoteControlSource, FakeTmux]:
    tmux = FakeTmux()
    pane = tmux.add_pane("default", "shop", "claude")
    pane.info = dataclasses.replace(pane.info, pid=4242)
    port = FakeRemoteControl()
    port.sessions = [  # no environment: run nowhere now
        session("cse_ORPHAN", title="shop checkout", environment_id=None, created_at="2026-11-01T09:00:00Z"),
        session("cse_FORK", title="shop checkout (fork)", environment_id=None, created_at="2026-11-02T09:00:00Z"),
        session("cse_STRANGER", title="notes", environment_id=None, created_at="2026-11-03T09:00:00Z"),
    ]
    port.events = {
        "cse_ORPHAN": _events(FIRST, "2026-11-01T09:00:00Z"),
        "cse_FORK": _events(FIRST, "2026-11-02T09:00:00Z"),
        "cse_STRANGER": _events(ELSE, "2026-11-03T09:00:00Z"),
    }
    source = RemoteControlSource(port, {})
    source.tick()
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False},
    )  # fmt: skip
    app = create_app(settings, tmux=tmux, run_loops=False, remote_control=source)
    Monitor(app.state.sessions, Panes({4242: str(pane_transcript)})).tick()
    return app, source, tmux


def _listed(app: Any) -> set[str]:
    client = TestClient(app)
    _, token = app.state.tokens.create(f"phone {len(app.state.tokens.list())}")
    return {s["id"] for s in client.get("/v1/sessions", headers={"Authorization": f"Bearer {token}"}).json()}


def test_an_earlier_bridge_of_a_conversation_that_went_on_in_a_pane_is_folded_into_it(tmp_path: Path) -> None:
    folder = tmp_path / "claude" / "projects" / "-home-dev-shop"
    folder.mkdir(parents=True)
    (folder / f"{OLD}.jsonl").write_text(
        _line(type="file-history-snapshot")
        + _line(type="user", uuid=FIRST, sessionId=OLD)
        + _line(type="assistant", uuid=LATER, sessionId=OLD)
        + _line(type="continued-in", continuedInSessionId=NOW, sessionId=OLD)
    )
    now = folder / f"{NOW}.jsonl"
    now.write_text(_line(type="user", uuid="f3f3f3f3-0000-4000-8000-000000000003", sessionId=NOW))
    app, source, _ = _setup(tmp_path, now)
    (pane,) = (s for s in app.state.directory.list() if s.source != "remote_control")
    assert {"cse_ORPHAN", "cse_FORK", "cse_STRANGER"} <= _listed(app)  # on their own until found

    passes = FormerBridges(app.state.directory, source.firsts, ClaudeProcesses(tmp_path / "claude").carries)
    assert passes.tick() == {"cse_ORPHAN": pane.id}
    listed = _listed(app)
    assert "cse_ORPHAN" not in listed and {"cse_FORK", "cse_STRANGER"} <= listed  # a fork, another conversation
    assert app.state.sessions.repo.remote_ids()["cse_ORPHAN"] == pane.id  # recorded: it stays folded
    assert app.state.directory.get("cse_ORPHAN").id == pane.id
    assert passes.tick() == {}  # nothing left to fold


def test_a_pane_resuming_the_conversation_takes_its_earlier_bridge(tmp_path: Path) -> None:
    """A resume writes a transcript that starts with the conversation's first message too."""
    folder = tmp_path / "claude" / "projects" / "-home-dev-shop"
    folder.mkdir(parents=True)
    now = folder / f"{NOW}.jsonl"
    now.write_text(_line(type="summary") + _line(type="user", uuid=FIRST, sessionId=NOW))
    app, source, _ = _setup(tmp_path, now)
    (pane,) = (s for s in app.state.directory.list() if s.source != "remote_control")
    found = FormerBridges(app.state.directory, source.firsts, ClaudeProcesses(tmp_path / "claude").carries).tick()
    assert found == {"cse_ORPHAN": pane.id}


def test_two_panes_of_one_conversation_take_none_of_its_bridges() -> None:
    from muxtower.sessions.former_bridges import owners_of

    orphan = type("S", (), {"id": "cse_ORPHAN"})()
    both = owners_of([orphan], {"cse_ORPHAN": FIRST}, {FIRST: ["a", "b"]})  # type: ignore[list-item]
    assert both == {}


def test_two_sessions_on_two_machines_take_none_of_its_bridges() -> None:
    from muxtower.sessions.former_bridges import owners_of

    orphan = type("S", (), {"id": "cse_ORPHAN"})()
    firsts = {"cse_ORPHAN": FIRST}
    assert owners_of([orphan], firsts, {FIRST: ["a"]}, {FIRST: ["mac~b"]}) == {}  # type: ignore[list-item]
    assert owners_of([orphan], firsts, {}, {FIRST: ["mac~b", "box~c"]}) == {}  # type: ignore[list-item]
    assert owners_of([orphan], firsts, {}, {FIRST: ["mac~b"]}) == {"cse_ORPHAN": "mac~b"}  # type: ignore[list-item]


def test_a_bridge_a_node_s_session_carried_is_folded_into_it_and_the_nodes_are_asked_once(tmp_path: Path) -> None:
    """Nothing here carries it; a node's session does (`NodeSource.carrying`): the bridge is that one's."""
    app, source, _ = _setup(tmp_path, tmp_path / "nowhere.jsonl")
    asked: list[list[str]] = []

    def nodes(firsts: list[str]) -> dict[str, list[str]]:
        asked.append(firsts)
        return {FIRST: ["mac~5ca1ab1e"]}

    carries = ClaudeProcesses(tmp_path / "claude").carries
    assert FormerBridges(app.state.directory, source.firsts, carries, nodes=nodes).tick() == {
        "cse_ORPHAN": "mac~5ca1ab1e"
    }
    assert asked == [sorted({FIRST, ELSE})]  # one batch: the orphans' firsts (a fork has none)
    assert app.state.sessions.repo.remote_ids()["cse_ORPHAN"] == "mac~5ca1ab1e"


def test_a_node_says_which_of_its_sessions_carry_a_first_message(tmp_path: Path) -> None:
    """The node method `carries`: its live sessions here whose transcript carries each first message."""
    import pytest

    from muxtower.errors import Invalid

    folder = tmp_path / "claude" / "projects" / "-home-dev-shop"
    folder.mkdir(parents=True)
    now = folder / f"{NOW}.jsonl"
    now.write_text(_line(type="user", uuid=FIRST, sessionId=NOW))
    app, _, _ = _setup(tmp_path, now)
    (pane,) = (s for s in app.state.directory.list() if s.source != "remote_control")
    api = app.state.hub.api
    api.processes = ClaudeProcesses(tmp_path / "claude")
    assert api.handle("carries", {"firsts": [FIRST, ELSE]}) == {FIRST: [pane.id]}
    with pytest.raises(Invalid):
        api.handle("carries", {"firsts": "not a list"})
