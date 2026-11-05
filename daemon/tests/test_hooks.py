import json
import shlex
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.hooks.claude_code import ClaudeCodeHooks
from muxtower.hooks.events import HookEvent, apply_event
from muxtower.runtimes.models import AgentState
from muxtower.sessions.live import HookState
from tests.fakes import FakeTmux


def ev(**fields: object) -> HookEvent:
    return HookEvent.model_validate(fields)


def test_permission_request_carries_the_command() -> None:
    state = apply_event(None, ev(hook_event_name="PermissionRequest", tool_name="Bash", tool_input={"command": "ls"}))
    assert state and state.state == AgentState.NEEDS_PERMISSION and state.detail == "ls"
    kept = apply_event(state, ev(hook_event_name="Notification", notification_type="permission_prompt"))
    assert kept is state


def test_stop_keeps_last_message_and_end_clears() -> None:
    state = apply_event(None, ev(hook_event_name="Stop", last_assistant_message="done"))
    assert state and state.state == AgentState.IDLE and state.last_message == "done"
    busy = apply_event(state, ev(hook_event_name="UserPromptSubmit"))
    assert busy and busy.state == AgentState.BUSY and busy.last_message == "done"
    assert apply_event(busy, ev(hook_event_name="SessionEnd")) is None


def test_question_and_plan_from_pre_tool_use() -> None:
    asking = ClaudeCodeHooks.asking
    q = apply_event(None, ev(hook_event_name="PreToolUse", tool_name="AskUserQuestion",
                             tool_input={"questions": [{"question": "Which DB?"}]}), asking)  # fmt: skip
    assert q and q.state == AgentState.NEEDS_ANSWER and q.detail == "Which DB?"
    asked = {"question": "Which DB?", "multiSelect": True, "options": [{"label": "SQLite"}, {"label": "Postgres"}]}
    full = apply_event(None, ev(hook_event_name="PreToolUse", tool_name="AskUserQuestion",
                                tool_input={"questions": [asked]}), asking)  # fmt: skip
    assert (
        full
        and [o.label for o in full.questions[0].options] == ["SQLite", "Postgres"]
        and full.questions[0].multi_select
    )
    assert HookState.load(full.dump()).questions == full.questions  # kept over a restart
    # Asking first (default permission mode): still the question, not a permission.
    asking_first = apply_event(full, ev(hook_event_name="PermissionRequest", tool_name="AskUserQuestion",
                                        tool_input={"questions": [asked]}), asking)  # fmt: skip
    assert asking_first and asking_first.state == AgentState.NEEDS_ANSWER and asking_first.questions == full.questions
    told = apply_event(asking_first, ev(hook_event_name="Notification", notification_type="permission_prompt",
                                         message="Claude needs your permission"), asking)  # fmt: skip
    assert told is asking_first  # the notification that follows says nothing new
    p = apply_event(
        None, ev(hook_event_name="PreToolUse", tool_name="ExitPlanMode", tool_input={"plan": "1. x"}), asking
    )
    assert p and p.state == AgentState.PLAN_REVIEW


def _launch(client: TestClient, auth: dict[str, str], tmp_path: Path) -> str:
    res = client.post("/v1/sessions", json={"runtime": "claude", "cwd": str(tmp_path)}, headers=auth)
    assert res.status_code == 201, res.text
    return str(res.json()["id"])


def test_launch_injects_relay_hooks(app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux,
                                    tmp_path: Path) -> None:  # fmt: skip
    session_id = _launch(client, auth, tmp_path)
    pane = next(iter(tmux.panes.values()))
    assert pane.argv[0] == "claude" and pane.argv[1] == "--settings"
    settings = json.loads(Path(pane.argv[2]).read_text())
    hook = settings["hooks"]["PermissionRequest"][0]["hooks"][0]
    assert hook["type"] == "command" and "relay.py" in hook["command"]  # no http hook: its errors reach the agent
    target = json.loads(Path(shlex.split(hook["command"])[-1]).read_text())
    assert target["url"].endswith("/v1/hooks/claude-code") and target["session"] == session_id
    assert target["token"] == pane.env["MUXTOWER_HOOK_TOKEN"] and target["token"] not in hook["command"]
    assert pane.env["MUXTOWER_SESSION_ID"] == session_id and pane.env["MUXTOWER_HOOK_TOKEN"]


def test_hook_endpoint_updates_state(app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux,
                                     tmp_path: Path) -> None:  # fmt: skip
    session_id = _launch(client, auth, tmp_path)
    token = next(iter(tmux.panes.values())).env["MUXTOWER_HOOK_TOKEN"]
    body = {"hook_event_name": "PermissionRequest", "tool_name": "Bash", "tool_input": {"command": "make"}}
    headers = {"Authorization": f"Bearer {token}", "X-Muxtower-Session": session_id}

    bad = client.post("/v1/hooks/claude-code", json=body, headers={**headers, "Authorization": "Bearer nope"})
    assert bad.status_code == 401
    ok = client.post("/v1/hooks/claude-code", json=body, headers=headers)
    assert ok.status_code == 200 and ok.content == b""

    session = client.get(f"/v1/sessions/{session_id}", headers=auth).json()
    assert session["state"] == "needs_permission" and session["needs_attention"]
    assert session["pending"]["detail"] == "make" and session["state_source"] == "hook"


def test_hook_state_survives_a_restart(make_app, tmux: FakeTmux, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    app = make_app()
    client = TestClient(app)
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}
    session_id = _launch(client, auth, tmp_path)
    hook_token = next(iter(tmux.panes.values())).env["MUXTOWER_HOOK_TOKEN"]
    body = {"hook_event_name": "PermissionRequest", "tool_name": "Bash", "tool_input": {"command": "make deploy"}}
    client.post("/v1/hooks/claude-code", json=body,
                headers={"Authorization": f"Bearer {hook_token}", "X-Muxtower-Session": session_id})  # fmt: skip

    restarted = TestClient(make_app())  # same state dir and tmux, fresh process state
    pending = restarted.get(f"/v1/sessions/{session_id}", headers=auth).json()["pending"]
    assert pending["tool_name"] == "Bash" and pending["detail"] == "make deploy"
