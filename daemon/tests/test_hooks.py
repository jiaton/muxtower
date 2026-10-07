import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.hooks.claude_code import HookEvent, apply_event
from muxtower.runtimes.models import AgentState
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
    q = apply_event(None, ev(hook_event_name="PreToolUse", tool_name="AskUserQuestion",
                             tool_input={"questions": [{"question": "Which DB?"}]}))  # fmt: skip
    assert q and q.state == AgentState.NEEDS_ANSWER and q.detail == "Which DB?"
    p = apply_event(None, ev(hook_event_name="PreToolUse", tool_name="ExitPlanMode", tool_input={"plan": "1. x"}))
    assert p and p.state == AgentState.PLAN_REVIEW


def _launch(client: TestClient, auth: dict[str, str], tmp_path: Path) -> str:
    res = client.post("/v1/sessions", json={"runtime": "claude", "cwd": str(tmp_path)}, headers=auth)
    assert res.status_code == 201, res.text
    return str(res.json()["id"])


def test_launch_injects_http_hooks(app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux,
                                   tmp_path: Path) -> None:  # fmt: skip
    session_id = _launch(client, auth, tmp_path)
    pane = next(iter(tmux.panes.values()))
    assert pane.argv[0] == "claude" and pane.argv[1] == "--settings"
    settings = json.loads(Path(pane.argv[2]).read_text())
    hook = settings["hooks"]["PermissionRequest"][0]["hooks"][0]
    assert hook["type"] == "http" and hook["url"].endswith("/v1/hooks/claude-code")
    assert pane.env["MUXTOWER_SESSION_ID"] == session_id and pane.env["MUXTOWER_HOOK_TOKEN"]


def test_hook_endpoint_updates_state(app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux,
                                     tmp_path: Path) -> None:  # fmt: skip
    session_id = _launch(client, auth, tmp_path)
    token = next(iter(tmux.panes.values())).env["MUXTOWER_HOOK_TOKEN"]
    body = {"hook_event_name": "PermissionRequest", "tool_name": "Bash", "tool_input": {"command": "make"}}
    headers = {"Authorization": f"Bearer {token}", "X-Muxtower-Session": session_id}

    bad = client.post("/v1/hooks/claude-code", json=body, headers={**headers, "Authorization": "Bearer nope"})
    assert bad.status_code == 403
    ok = client.post("/v1/hooks/claude-code", json=body, headers=headers)
    assert ok.status_code == 200 and ok.content == b""

    session = client.get(f"/v1/sessions/{session_id}", headers=auth).json()
    assert session["state"] == "needs_permission" and session["needs_attention"]
    assert session["pending"]["detail"] == "make" and session["state_source"] == "hook"
