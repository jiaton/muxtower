"""Continue in terminal: a Remote Control session only (the Claude desktop app's) is closed on the Claude account,
read back so, then resumed in a muxtower pane on its machine, and listed once, as that pane, with what the owner
gave it. Remote Control is a fake (`rc_fakes.py`), the pane a fake tmux; where its conversation is on its
machine (`continuing/place.py`) is faked per test. Made-up sessions and folders."""

import threading
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.app import create_app
from muxtower.chips.service import ChipGroup, ChipGroups
from muxtower.config import load_settings
from muxtower.continuing.models import ContinueStep
from muxtower.continuing.ports import Place
from muxtower.errors import Invalid, Unavailable
from muxtower.sources.remote_control.service import RemoteControlSource
from tests.fakes import FakeTmux
from tests.rc_fakes import FakeRemoteControl, session

AGENT = "5e5e5e5e-0000-4000-8000-000000000001"
ENVIRONMENTS = {"env_box": "build-box", "env_far": "far-box"}


class Where:
    """The conversation as its machine sees it: the test says what is there, and reads what was asked."""

    def __init__(self, folder: str) -> None:
        self.place = Place(AGENT, folder, True, False)
        self.live_after_close = 0  # looks that still find a process holding it, once closed
        self.error: Exception | None = None
        self.asked: list[tuple[str | None, str | None, str | None]] = []
        self.hold: threading.Event | None = None  # a look for the start waits on it
        self.starting = threading.Event()

    def __call__(self, node: str | None, remote_id: str | None, agent_id: str | None) -> Place:
        self.asked.append((node, remote_id, agent_id))
        if self.error:
            raise self.error
        if agent_id is not None:  # the start's look
            self.starting.set()
            if self.hold:
                self.hold.wait(5)
            if self.live_after_close:
                self.live_after_close -= 1
                return Place(AGENT, self.place.cwd, True, True)
        return self.place


def _port(**over: Any) -> FakeRemoteControl:
    port = FakeRemoteControl()
    port.sessions = [
        session("cse_desk", title="Plan the launch", tags=["remote-control-sdk"], **over),
        session("cse_cloud", environment_id=None, environment_kind="anthropic_cloud"),
        session("cse_lost", environment_id="env_0123456789"),
        session("cse_far", environment_id="env_far", tags=["remote-control-sdk"]),
    ]
    return port


def _app(tmp_path: Path, port: FakeRemoteControl, tmux: FakeTmux | None = None) -> tuple[FastAPI, Where]:
    source = RemoteControlSource(port, ENVIRONMENTS)
    source.tick()
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False, "adopt_sockets": [],
                   "name": "build-box"},
    )  # fmt: skip
    app = create_app(settings, tmux=tmux or FakeTmux(), run_loops=False, remote_control=source)
    folder = tmp_path / "shop"
    folder.mkdir()
    where = Where(str(folder))
    app.state.continuer.look = where
    app.state.continuer.sleep = lambda seconds: None
    return app, where


def _client(app: FastAPI) -> TestClient:
    _, token = app.state.tokens.create("phone")
    return TestClient(app, headers={"Authorization": f"Bearer {token}"})


def _archives(port: FakeRemoteControl) -> list[tuple[Any, ...]]:
    return [c for c in port.calls if c[0] == "archive"]


def _panes(tmux: FakeTmux) -> list[list[str]]:
    return [p.argv for p in tmux.panes.values()]


def _audit(app: FastAPI) -> list[tuple[str, str | None, str | None]]:
    with app.state.audit.db.connect() as conn:
        rows = conn.execute("SELECT action, session_id, detail FROM audit_log ORDER BY id").fetchall()
    return [(r["action"], r["session_id"], r["detail"]) for r in rows if r["action"].startswith("continue")]


# --- preconditions ----------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("session_id", "said"),
    [
        ("cse_cloud", "It runs in Anthropic's cloud (claude.ai): there is no machine of yours to continue it on"),
        ("cse_lost", "It runs on a machine muxtower does not know: link that computer to this hub first"),
        ("cse_far", "far-box is not linked to this hub: link it first"),
    ],
)
def test_where_it_runs_must_be_a_machine_of_yours(tmp_path: Path, session_id: str, said: str) -> None:
    port = _port()
    app, _ = _app(tmp_path, port)
    client = _client(app)
    checked = client.get(f"/v1/sessions/{session_id}/continue").json()
    assert checked["step"] == "blocked" and checked["reason"] == said
    answer = client.post(f"/v1/sessions/{session_id}/continue")
    assert answer.status_code == 409 and answer.json()["detail"] == said
    assert _archives(port) == []


def test_a_node_that_is_offline_says_so(tmp_path: Path) -> None:
    app, _ = _app(tmp_path, _port())
    app.state.continuer.is_node = lambda machine: machine == "far-box"
    checked = _client(app).get("/v1/sessions/cse_far/continue").json()
    assert checked["reason"] == "far-box is offline: it can be continued once muxtower there is back"


@pytest.mark.parametrize(
    ("over", "said"),
    [
        ({"worker_status": "running"}, "Wait until it's idle: it is in the middle of a turn"),
        ({"worker_status": "requires_action"}, "Wait until it's idle: it is in the middle of a turn"),
    ],
)
def test_it_waits_until_the_session_is_idle(tmp_path: Path, over: dict[str, Any], said: str) -> None:
    port = _port(**over)
    app, _ = _app(tmp_path, port)
    client = _client(app)
    assert client.get("/v1/sessions/cse_desk/continue").json()["reason"] == said
    assert client.post("/v1/sessions/cse_desk/continue").json()["detail"] == said
    assert _archives(port) == []


def test_its_conversation_and_transcript_must_be_on_its_machine(tmp_path: Path) -> None:
    port = _port()
    app, where = _app(tmp_path, port)
    client = _client(app)

    def said() -> str:
        return str(client.get("/v1/sessions/cse_desk/continue").json()["reason"])

    where.place = Place(None, None, False, False)
    assert said() == "Its conversation was not found on build-box: no Claude Code there names it"
    where.place = Place(AGENT, "/x", False, True)
    assert said() == "Its transcript is not on build-box"
    where.error = Invalid("unknown method claude_conversation")
    assert said() == "build-box cannot do this yet: update muxtower there (unknown method claude_conversation)"
    where.error = Unavailable("the link is down")
    assert said() == "build-box did not answer: the link is down"
    assert client.post("/v1/sessions/cse_desk/continue").status_code == 409
    assert _archives(port) == [] and where.asked[0] == (None, "cse_desk", None)  # looked up on this machine


def test_the_list_offers_it_with_why_not_now_without_asking_its_machine(tmp_path: Path) -> None:
    app, where = _app(tmp_path, _port())
    by_id = {s.id: s for s in app.state.directory.list()}
    assert by_id["cse_desk"].capabilities.continue_terminal and by_id["cse_desk"].continue_blocked is None
    assert by_id["cse_cloud"].continue_blocked.startswith("It runs in Anthropic's cloud")
    assert where.asked == []  # its transcript is looked for only when asked


def test_a_session_that_can_be_continued_says_so(tmp_path: Path) -> None:
    app, _ = _app(tmp_path, _port())
    checked = _client(app).get("/v1/sessions/cse_desk/continue").json()
    assert checked == {"step": "ready", "reason": None, "machine": "build-box", "session_id": None, "retry": False}


# --- the run --------------------------------------------------------------------------------------


def test_it_is_closed_on_the_account_then_resumed_in_a_pane_and_listed_once(tmp_path: Path) -> None:
    port, tmux = _port(), FakeTmux()
    app, where = _app(tmp_path, port, tmux)
    order: list[str] = []
    archive = port.archive_session
    port.archive_session = lambda sid: (order.append("archive"), archive(sid))[1]  # type: ignore[method-assign]
    create = app.state.launcher.create
    app.state.launcher.create = lambda request: (order.append("start"), create(request))[1]

    done = _client(app).post("/v1/sessions/cse_desk/continue").json()

    assert done["step"] == "done" and done["machine"] == "build-box" and order == ["archive", "start"]
    [argv] = _panes(tmux)
    assert argv[-2:] == ["--resume", AGENT] and "--name" in argv and "Plan the launch" in argv
    assert tmux.panes[next(iter(tmux.panes))].info.cwd == where.place.cwd
    listed = app.state.directory.list()
    assert [s.id for s in listed] == [done["session_id"], "cse_cloud", "cse_lost", "cse_far"]
    pane = app.state.directory.get(done["session_id"])
    assert pane.name == "Plan the launch" and pane.source == "launched"
    assert app.state.directory.get("cse_desk").id == done["session_id"]  # its old id leads to it


def test_nothing_starts_when_the_archive_fails(tmp_path: Path) -> None:
    port, tmux = _port(), FakeTmux()
    app, _ = _app(tmp_path, port, tmux)

    def refused(session_id: str) -> None:
        raise Unavailable("Remote Control answered HTTP 500")

    port.archive_session = refused  # type: ignore[method-assign]
    failed = _client(app).post("/v1/sessions/cse_desk/continue").json()
    assert failed["step"] == "failed" and not failed["retry"]
    assert failed["reason"] == (
        "Could not close it in the Claude app: Remote Control answered HTTP 500. Nothing was started."
    )
    assert _panes(tmux) == []
    assert _audit(app) == [("continue-in-terminal-failed", "cse_desk", "at=close machine=build-box")]


def test_nothing_starts_when_the_archive_cannot_be_read_back(tmp_path: Path) -> None:
    port, tmux = _port(), FakeTmux()
    app, _ = _app(tmp_path, port, tmux)
    port.archive_session = lambda sid: port.calls.append(("archive", sid))  # type: ignore[method-assign,func-returns-value]
    client = _client(app)
    failed = client.post("/v1/sessions/cse_desk/continue").json()
    assert failed["step"] == "failed" and "Remote Control still lists it as active" in failed["reason"]
    assert _panes(tmux) == []
    assert client.get("/v1/sessions/cse_desk/continue").json() == failed  # no longer listed: said as it stopped
    # Tried again once Remote Control has it archived: it goes on.
    port.archive_session = FakeRemoteControl.archive_session.__get__(port)  # type: ignore[method-assign]
    assert client.post("/v1/sessions/cse_desk/continue").json()["step"] == "done"
    assert len(_archives(port)) == 2 and len(_panes(tmux)) == 1


def test_a_second_click_after_it_finished_does_nothing_again(tmp_path: Path) -> None:
    port, tmux = _port(), FakeTmux()
    app, _ = _app(tmp_path, port, tmux)
    client = _client(app)
    first = client.post("/v1/sessions/cse_desk/continue").json()
    again = client.post("/v1/sessions/cse_desk/continue").json()
    assert again == first and again["step"] == "done"
    assert client.get("/v1/sessions/cse_desk/continue").json() == first
    assert len(_archives(port)) == 1 and len(_panes(tmux)) == 1


def test_a_second_click_while_it_runs_says_how_far_it_got(tmp_path: Path) -> None:
    port, tmux = _port(), FakeTmux()
    app, where = _app(tmp_path, port, tmux)
    where.hold = threading.Event()
    service = app.state.continuer
    finished: list[Any] = []
    first = threading.Thread(target=lambda: finished.append(service.run("cse_desk", "phone")))
    first.start()
    assert where.starting.wait(5)
    second = service.run("cse_desk", "laptop")
    assert second.step == ContinueStep.STARTING and service.check("cse_desk").step == ContinueStep.STARTING
    where.hold.set()
    first.join(5)
    assert finished[0].step == ContinueStep.DONE
    assert len(_archives(port)) == 1 and len(_panes(tmux)) == 1


def test_a_pane_that_does_not_start_says_so_and_retry_starts_it(tmp_path: Path) -> None:
    port, tmux = _port(), FakeTmux()
    tmux.exits_with = "Error: something went wrong"
    app, _ = _app(tmp_path, port, tmux)
    client = _client(app)
    failed = client.post("/v1/sessions/cse_desk/continue").json()
    assert failed["step"] == "failed" and failed["retry"] is True
    assert failed["reason"].startswith("It is closed in the Claude app, but did not start on build-box: claude exited")
    assert client.get("/v1/sessions/cse_desk/continue").json() == failed  # gone from the list: said as it is
    assert _panes(tmux) == []

    done = client.post("/v1/sessions/cse_desk/continue").json()  # Retry
    assert done["step"] == "done" and len(_panes(tmux)) == 1 and len(_archives(port)) == 1
    assert [a for a, _, _ in _audit(app)] == ["continue-in-terminal-failed", "continue-in-terminal"]


def test_it_waits_for_the_claude_app_to_let_go_of_the_conversation(tmp_path: Path) -> None:
    port, tmux = _port(), FakeTmux()
    app, where = _app(tmp_path, port, tmux)
    where.live_after_close = 3  # the app lets go a few seconds after the archive
    assert _client(app).post("/v1/sessions/cse_desk/continue").json()["step"] == "done"
    assert len(_panes(tmux)) == 1


def test_it_never_resumes_a_conversation_still_open_on_its_machine(tmp_path: Path) -> None:
    port, tmux = _port(), FakeTmux()
    app, where = _app(tmp_path, port, tmux)
    where.live_after_close = 10_000  # it never does
    failed = _client(app).post("/v1/sessions/cse_desk/continue").json()
    assert failed["step"] == "failed" and failed["retry"]
    assert "the Claude app on build-box still has it open" in failed["reason"]
    assert _panes(tmux) == [] and len(_archives(port)) == 1


# --- what it keeps --------------------------------------------------------------------------------


def test_the_pane_session_keeps_its_name_project_role_note_chips_and_marks(tmp_path: Path) -> None:
    port, tmux = _port(unread=True), FakeTmux()
    app, _ = _app(tmp_path, port, tmux)
    client = _client(app)
    teams, directory = app.state.teams, app.state.directory
    teams.set_project("cse_desk", "acme/shop")
    teams.set_role("cse_desk", "researcher", "reads the market notes")
    directory.pin("cse_desk", True)
    directory.set_auto_read("cse_desk", False)
    app.state.chip_groups.replace(
        ChipGroups(groups=[ChipGroup(id="g1", name="Launch", projects=[], sessions=["cse_desk", "cse_other"])])
    )
    assert directory.get("cse_desk").unread

    done = client.post("/v1/sessions/cse_desk/continue").json()

    pane = directory.get(done["session_id"])
    assert (pane.name, pane.project, pane.team_role, pane.team_note) == (
        "Plan the launch",
        "acme/shop",
        "researcher",
        "reads the market notes",
    )
    assert pane.pinned and pane.unread and not pane.hidden
    assert app.state.chip_groups.load().groups[0].sessions == [done["session_id"], "cse_other"]
    assert [s.id for s in directory.list()].count(done["session_id"]) == 1
    assert "cse_desk" not in {s.id for s in directory.list()}


def test_a_session_read_before_is_read_as_the_pane(tmp_path: Path) -> None:
    app, _ = _app(tmp_path, _port(unread=False))
    done = _client(app).post("/v1/sessions/cse_desk/continue").json()
    assert not app.state.directory.get(done["session_id"]).unread


def test_it_is_audited_without_content(tmp_path: Path) -> None:
    app, _ = _app(tmp_path, _port())
    done = _client(app).post("/v1/sessions/cse_desk/continue").json()
    [row] = _audit(app)
    assert row == ("continue-in-terminal", "cse_desk", f"session={done['session_id']} machine=build-box")
    assert "Plan the launch" not in str(row)
