import pytest

from muxtower.errors import Conflict, Invalid
from muxtower.runtimes.models import AgentState
from muxtower.sources.remote_control.service import RemoteControlSource
from tests.rc_fakes import FakeRemoteControl, assistant, permission, session


def make() -> tuple[FakeRemoteControl, RemoteControlSource]:
    port = FakeRemoteControl()
    return port, RemoteControlSource(port, {"env_nas": "nas"})


def test_lists_active_sessions_with_machine_origin_and_summary() -> None:
    port, src = make()
    port.sessions = [session("cse_1"), session("cse_2", status="archived")]
    port.events["cse_1"] = [assistant(1, {"type": "text", "text": "All green."})]
    port.details["cse_1"] = {"post_turn_summary": {"status_detail": "tests pass", "recent_action": "ran tests",
                                                   "needs_action": "", "is_noteworthy": "True"}}  # fmt: skip
    src.tick()
    (view,) = src.views()
    assert (view.id, view.machine, view.origin, view.state) == ("cse_1", "nas", "desktop_app", AgentState.IDLE)
    assert view.summary and view.summary.detail == "tests pass" and view.summary.noteworthy
    assert view.last_message == "All green." and not view.capabilities.screen


def test_permission_prompt_alerts_once_and_is_answered() -> None:
    port, src = make()
    port.sessions = [session("cse_1", worker_status="running")]
    src.tick()
    port.sessions = [session("cse_1", worker_status="requires_action", last_event_at="2026-10-18T10:05:00Z")]
    port.events["cse_1"] = [permission(9, "r1", "Bash", {"command": "make deploy"})]
    result = src.tick()
    view = src.views()[0]
    assert result.attention == ["cse_1"] and view.state == AgentState.NEEDS_PERMISSION
    assert view.pending and view.pending.detail == "make deploy" and view.pending.recommended == "allow"
    assert src.approve("cse_1", None) == (AgentState.NEEDS_PERMISSION, "allow")
    assert port.calls[-1] == ("permission", "cse_1", "r1", True, {"command": "make deploy"})
    with pytest.raises(Invalid):
        src.approve("cse_1", "maybe")


def test_question_is_answered_with_the_chosen_label() -> None:
    port, src = make()
    q = {"questions": [{"question": "Which DB?", "options": [{"label": "SQLite"}, {"label": "Postgres"}]}]}
    port.sessions = [session("cse_1", worker_status="requires_action")]
    port.events["cse_1"] = [permission(3, "q1", "AskUserQuestion", q)]
    src.tick()
    view = src.views()[0]
    assert view.state == AgentState.NEEDS_ANSWER and [o.label for o in view.pending.options] == ["SQLite", "Postgres"]  # type: ignore[union-attr]
    src.approve("cse_1", "2")
    assert port.calls[-1] == ("answer", "cse_1", "q1", {"Which DB?": "Postgres"})


def test_messages_keys_and_nothing_to_answer() -> None:
    port, src = make()
    port.sessions = [session("cse_1")]
    src.tick()
    src.send_text("cse_1", "继续")
    src.send_key("cse_1", "Escape")
    assert port.calls == [("message", "cse_1", "继续"), ("interrupt", "cse_1")]
    with pytest.raises(Conflict):
        src.send_key("cse_1", "Up")
    with pytest.raises(Conflict):
        src.approve("cse_1", None)


def test_sessions_that_end_disappear() -> None:
    port, src = make()
    port.sessions = [session("cse_1")]
    src.tick()
    port.sessions = []
    assert src.tick().changed and src.views() == []
