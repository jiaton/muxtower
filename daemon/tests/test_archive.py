import dataclasses
from pathlib import Path

from fastapi.testclient import TestClient

from muxtower.app import create_app
from muxtower.config import load_settings
from muxtower.sessions.monitor import Monitor
from muxtower.sources.remote_control.service import RemoteControlSource
from tests.fakes import FakeTmux
from tests.rc_fakes import FakeRemoteControl, assistant, session
from tests.test_linking import FakeProcesses
from tests.test_transcripts import line


def _app(tmp_path: Path, tmux: FakeTmux, source: RemoteControlSource):  # type: ignore[no-untyped-def]
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False},
    )  # fmt: skip
    return create_app(settings, tmux=tmux, run_loops=False, remote_control=source)


def test_archiving_ends_a_tmux_agent_and_keeps_its_conversation(tmp_path: Path) -> None:
    tmux = FakeTmux()
    pane = tmux.add_pane("default", "work", "claude")
    pane.info = dataclasses.replace(pane.info, pid=4242)
    tmux.add_pane("default", "other", "claude")
    transcript = tmp_path / "t.jsonl"
    transcript.write_text(line("user", "fix the build") + line("assistant", "Fixed."))
    port = FakeRemoteControl()
    port.sessions = [session("cse_1", title="Fix the build")]
    source = RemoteControlSource(port, {})
    source.tick()
    app = _app(tmp_path, tmux, source)
    Monitor(app.state.sessions, FakeProcesses({4242: "cse_1"}, {4242: str(transcript)})).tick()
    client = TestClient(app)
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}
    merged = next(s for s in client.get("/v1/sessions", headers=auth).json() if s["remote_id"] == "cse_1")
    assert merged["capabilities"]["archive"]

    assert client.post(f"/v1/sessions/{merged['id']}/archive", headers=auth).status_code == 204
    assert ("archive", "cse_1") in port.calls  # archived on Remote Control too
    assert ("default", pane.info.pane_id) not in tmux.panes and len(tmux.panes) == 1  # only its pane closed
    listed = client.get("/v1/sessions", headers=auth).json()
    (archived,) = (s for s in listed if s["archived_at"])
    assert archived["id"] == merged["id"] and archived["name"] == "Fix the build"
    assert not any(s["id"] == "cse_1" for s in listed)  # not listed again as a Remote Control session
    caps = archived["capabilities"]
    assert (caps["conversation"], caps["screen"], caps["archive"], caps["terminate"]) == (True, False, False, True)
    conv = client.get(f"/v1/sessions/{archived['id']}/conversation", headers=auth).json()
    assert [i["text"] for i in conv["items"]] == ["fix the build", "Fixed."]  # read from the transcript
    sent = client.post(f"/v1/sessions/{archived['id']}/input", headers=auth, json={"text": "hi"})
    assert sent.status_code == 409

    assert client.delete(f"/v1/sessions/{archived['id']}", headers=auth).status_code == 204  # out of the archive
    assert not any(s["archived_at"] for s in client.get("/v1/sessions", headers=auth).json())


def test_archiving_a_remote_session_keeps_the_conversation_it_had(tmp_path: Path) -> None:
    port = FakeRemoteControl()
    port.sessions = [session("cse_away", title="Elsewhere")]
    port.events = {"cse_away": [assistant(1, {"type": "text", "text": "Done over there."})]}
    source = RemoteControlSource(port, {})
    source.tick()
    app = _app(tmp_path, FakeTmux(), source)
    client = TestClient(app)
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}

    assert client.post("/v1/sessions/cse_away/archive", headers=auth).status_code == 204
    assert port.calls == [("archive", "cse_away")]
    (archived,) = client.get("/v1/sessions", headers=auth).json()
    assert archived["archived_at"] and archived["name"] == "Elsewhere"
    conv = client.get("/v1/sessions/cse_away/conversation", headers=auth).json()
    assert [i["text"] for i in conv["items"]] == ["Done over there."]
    # kept across a restart
    again = TestClient(_app(tmp_path, FakeTmux(), RemoteControlSource(port, {})))
    assert [s["id"] for s in again.get("/v1/sessions", headers=auth).json()] == ["cse_away"]


def test_a_node_session_on_remote_control_is_archived_there_too() -> None:
    """Its node has no Remote Control of its own: the hub archives that side, then the node its tmux."""
    from types import SimpleNamespace
    from typing import Any

    from muxtower.sessions.archiving import Archiver
    from muxtower.sessions.models import Conversation

    done: list[tuple[str, str]] = []

    class Source:
        def __init__(self, name: str) -> None:
            self.name = name

        def archive(self, session_id: str) -> None:
            done.append((self.name, session_id))

    node, remote = Source("node"), Source("remote control")
    on_mac = SimpleNamespace(id="mac~ab12", remote_id="cse_9", capabilities=SimpleNamespace(conversation=True))
    sources = {"mac~ab12": node, "cse_9": remote}
    directory: Any = SimpleNamespace(
        require=lambda sid, _: on_mac, source_of=sources.get,
        conversation=lambda sid, after, limit: Conversation(session_id=sid, items=[], latest_seq=0),
    )  # fmt: skip
    kept: list[Any] = []
    store: Any = SimpleNamespace(keep=lambda *args: kept.append(args))
    Archiver(directory, store).archive("mac~ab12")
    assert done == [("remote control", "cse_9"), ("node", "mac~ab12")] and len(kept) == 1
