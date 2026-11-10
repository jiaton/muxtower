import pytest

from muxtower.errors import Conflict, Invalid
from muxtower.runtimes.models import AgentState
from muxtower.sessions.models import ItemStatus
from muxtower.sources.remote_control.ports import RawEvent
from muxtower.sources.remote_control.service import RemoteControlSource
from tests.rc_fakes import FakeRemoteControl, answered, assistant, permission, session, user


def make() -> tuple[FakeRemoteControl, RemoteControlSource]:
    port = FakeRemoteControl()
    return port, RemoteControlSource(port, {"env_box": "build-box"})


def test_lists_active_sessions_with_machine_origin_and_summary() -> None:
    port, src = make()
    port.sessions = [session("cse_1"), session("cse_2", status="archived")]
    port.events["cse_1"] = [assistant(1, {"type": "text", "text": "All green."})]
    port.details["cse_1"] = {"post_turn_summary": {"status_detail": "tests pass", "recent_action": "ran tests",
                                                   "needs_action": "", "is_noteworthy": "True"}}  # fmt: skip
    src.tick()
    (view,) = src.views()
    assert (view.id, view.machine, view.origin, view.state) == ("cse_1", "build-box", "desktop_app", AgentState.IDLE)
    assert view.summary and view.summary.detail == "tests pass" and view.summary.noteworthy
    assert view.last_message == "All green." and not view.capabilities.screen


def test_launcher_from_tags_and_folder_from_the_log() -> None:
    port, src = make()
    port.sessions = [session("cse_1", tags=["remote-control-sdk"], config={"origin": "claude_code_cli"})]
    port.events["cse_1"] = [
        RawEvent(1, None, "worker", {"type": "system", "subtype": "vcs_state_changed", "cwd": "/w"})
    ]
    src.tick()
    (view,) = src.views()
    assert (view.origin, view.cwd) == ("claude_desktop", "/w")


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


def test_several_questions_are_answered_at_once() -> None:
    port, src = make()
    q = {"questions": [
        {"question": "Which fruits?", "multiSelect": True, "options": [{"label": "Apple"}, {"label": "Cherry"}]},
        {"question": "Which size?", "options": [{"label": "Small"}, {"label": "Large"}]},
    ]}  # fmt: skip
    port.sessions = [session("cse_1", worker_status="requires_action")]
    port.events["cse_1"] = [permission(3, "q1", "AskUserQuestion", q)]
    src.tick()
    asked = src.views()[0].pending
    assert asked and [(x.question, x.multi_select) for x in asked.questions] == [
        ("Which fruits?", True),
        ("Which size?", False),
    ]
    src.approve("cse_1", None, [["Apple", "Cherry"], ["Large"]])
    assert port.calls[-1] == ("answer", "cse_1", "q1", {"Which fruits?": "Apple, Cherry", "Which size?": "Large"})


def test_messages_keys_and_nothing_to_answer() -> None:
    port, src = make()
    port.sessions = [session("cse_1")]
    src.tick()
    src.send_text("cse_1", "continue")
    src.send_key("cse_1", "Escape")
    assert port.calls == [("message", "cse_1", "continue"), ("interrupt", "cse_1")]
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


def test_answering_rereads_the_log_first() -> None:
    port, src = make()
    port.sessions = [session("cse_1", worker_status="requires_action")]
    port.events["cse_1"] = [permission(1, "r1", "Bash", {"command": "make deploy"})]
    src.tick()
    port.events["cse_1"].append(answered(2, "r1"))  # answered on another device since the last poll
    port.sessions = [session("cse_1", worker_status="running")]
    with pytest.raises(Conflict):
        src.approve("cse_1", None)
    assert port.calls == []
    assert [i.status for i in src.tick().conversation["cse_1"]] == [ItemStatus.ALLOWED]  # still streamed


def test_long_gaps_are_read_page_by_page() -> None:
    port, src = make()
    port.sessions = [session("cse_1")]
    src.tick()
    port.events["cse_1"] = [user(n, f"message {n}") for n in range(1, 451)]
    port.sessions = [session("cse_1", last_event_at="2026-10-18T11:00:00Z")]
    assert len(src.tick().conversation["cse_1"]) == 450
