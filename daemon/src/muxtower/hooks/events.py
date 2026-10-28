"""What an agent's hooks say, in one vocabulary, and the state it means (pure).

Every harness with hooks muxtower knows names its events the way Claude Code does (Codex copied them),
so that is the vocabulary: a harness (`ports.HookHarness`) reads its own payload into a `HookEvent`,
and `apply_event` turns it into the session's hook state. Fields a harness does not send stay empty."""

import time
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict

from muxtower.agent_text import describe_tool_input, questions_of, truncate
from muxtower.runtimes.models import AgentState
from muxtower.sessions.live import HookState

SESSION_HEADER = "X-Muxtower-Session"


class HookEvent(BaseModel):
    model_config = ConfigDict(extra="allow")

    hook_event_name: str
    tool_name: str | None = None
    tool_input: Any = None
    notification_type: str | None = None
    message: str | None = None
    last_assistant_message: str | None = None
    transcript_path: str | None = None  # where the agent writes its transcript now (Claude Code)


@dataclass(frozen=True)
class AskingTools:
    """Tools whose call is the agent asking the owner, not working."""

    questions: frozenset[str] = frozenset()
    plans: frozenset[str] = frozenset()


NOTHING_ASKS = AskingTools()


def apply_event(previous: HookState | None, event: HookEvent, asking: AskingTools = NOTHING_ASKS) -> HookState | None:
    """Next hook state for a session after `event`; None means "no hook opinion" (session ended)."""
    now = time.monotonic()
    last_message = previous.last_message if previous else None
    name = event.hook_event_name

    def state(s: AgentState, tool: str | None = None, detail: str | None = None) -> HookState:
        return HookState(state=s, at=now, tool_name=tool, detail=detail, last_message=last_message)

    if name == "SessionEnd":
        return None
    # Asking the owner is a tool call too: in a permission mode that asks first, its PermissionRequest
    # follows the PreToolUse, and is still the question (or the plan), not a permission.
    if name in ("PreToolUse", "PermissionRequest") and event.tool_name in asking.questions:
        asked = state(AgentState.NEEDS_ANSWER, event.tool_name, describe_tool_input(event.tool_input))
        asked.questions = questions_of(event.tool_input)
        return asked
    if name == "PermissionRequest" and event.tool_name in asking.plans:
        return state(AgentState.PLAN_REVIEW, event.tool_name, describe_tool_input(event.tool_input))
    if name == "PermissionRequest":
        return state(AgentState.NEEDS_PERMISSION, event.tool_name, describe_tool_input(event.tool_input))
    if name == "PreToolUse" and event.tool_name in asking.plans:
        return state(AgentState.PLAN_REVIEW, event.tool_name, describe_tool_input(event.tool_input))
    if name == "Notification":
        kind = event.notification_type
        asking_already = (AgentState.NEEDS_PERMISSION, AgentState.NEEDS_ANSWER, AgentState.PLAN_REVIEW)
        if kind == "permission_prompt":
            if previous is not None and previous.state in asking_already:
                return previous  # keep what the tool call said (a question's questions, too)
            return state(AgentState.NEEDS_PERMISSION, detail=event.message)
        if kind in ("elicitation_dialog", "agent_needs_input"):
            if previous is not None and previous.state == AgentState.NEEDS_ANSWER:
                return previous
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
    if name in ("SessionStart", "Interrupt"):  # Interrupt: the owner stopped the turn (Codex)
        return state(AgentState.IDLE)
    # UserPromptSubmit, PreToolUse, PostToolUse(Failure), PermissionDenied: the agent is working.
    return state(AgentState.BUSY)
