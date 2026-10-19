"""Claude Code integration: the `--settings` JSON that points its http hooks at the daemon, and the
mapping from hook events to agent state. Nothing is written to the user's own settings.json."""

import time
from typing import Any

from pydantic import BaseModel, ConfigDict

from muxtower.agent_text import describe_tool_input, truncate
from muxtower.runtimes.models import AgentState
from muxtower.sessions.live import HookState

SESSION_HEADER = "X-Muxtower-Session"
EVENTS = [
    "SessionStart",
    "SessionEnd",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "PermissionRequest",
    "PermissionDenied",
    "Notification",
    "Stop",
    "StopFailure",
]


def hook_settings(daemon_url: str) -> dict[str, Any]:
    hook = {
        "type": "http",
        "url": f"{daemon_url}/v1/hooks/claude-code",
        "headers": {
            "Authorization": "Bearer ${MUXTOWER_HOOK_TOKEN}",
            SESSION_HEADER: "${MUXTOWER_SESSION_ID}",
        },
        "allowedEnvVars": ["MUXTOWER_HOOK_TOKEN", "MUXTOWER_SESSION_ID"],
        "timeout": 5,
    }
    return {"hooks": {event: [{"hooks": [hook]}] for event in EVENTS}}


class HookEvent(BaseModel):
    model_config = ConfigDict(extra="allow")

    hook_event_name: str
    tool_name: str | None = None
    tool_input: Any = None
    notification_type: str | None = None
    message: str | None = None
    last_assistant_message: str | None = None


def apply_event(previous: HookState | None, event: HookEvent) -> HookState | None:
    """Next hook state for a session after `event`; None means "no hook opinion" (session ended)."""
    now = time.monotonic()
    last_message = previous.last_message if previous else None
    name = event.hook_event_name

    def state(s: AgentState, tool: str | None = None, detail: str | None = None) -> HookState:
        return HookState(state=s, at=now, tool_name=tool, detail=detail, last_message=last_message)

    if name == "SessionEnd":
        return None
    if name == "PermissionRequest":
        return state(AgentState.NEEDS_PERMISSION, event.tool_name, describe_tool_input(event.tool_input))
    if name == "PreToolUse" and event.tool_name == "AskUserQuestion":
        return state(AgentState.NEEDS_ANSWER, event.tool_name, describe_tool_input(event.tool_input))
    if name == "PreToolUse" and event.tool_name == "ExitPlanMode":
        return state(AgentState.PLAN_REVIEW, event.tool_name, describe_tool_input(event.tool_input))
    if name == "Notification":
        kind = event.notification_type
        if kind == "permission_prompt":
            if previous is not None and previous.state == AgentState.NEEDS_PERMISSION:
                return previous  # keep the tool details from PermissionRequest
            return state(AgentState.NEEDS_PERMISSION, detail=event.message)
        if kind in ("elicitation_dialog", "agent_needs_input"):
            return state(AgentState.NEEDS_ANSWER, detail=event.message)
        if kind == "idle_prompt":
            return state(AgentState.IDLE)
        return previous
    if name == "Stop":
        if event.last_assistant_message:
            last_message = truncate(event.last_assistant_message)
        return state(AgentState.IDLE)
    if name == "StopFailure":
        return state(AgentState.ERROR, detail=event.message)
    if name == "SessionStart":
        return state(AgentState.IDLE)
    # UserPromptSubmit, PreToolUse, PostToolUse(Failure), PermissionDenied: the agent is working.
    return state(AgentState.BUSY)
