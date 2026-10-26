"""The requests a Codex app-server waits on the owner for (approvals of a command, a file change or
permissions; questions), as a pending action with choices, and the answer to send for a choice."""

from typing import Any

from muxtower.runtimes.models import AgentState, Option
from muxtower.sessions.models import ItemStatus, PendingAction
from muxtower.sources.codex.ports import Message

APPROVALS = {
    "item/commandExecution/requestApproval": "exec_command",
    "item/fileChange/requestApproval": "apply_patch",
    "item/permissions/requestApproval": "permissions",
    "execCommandApproval": "exec_command",  # v1
    "applyPatchApproval": "apply_patch",  # v1
}
QUESTIONS = {"item/tool/requestUserInput", "mcpServer/elicitation/request"}
# The choices offered, of those a request allows: once, for the session, no (the agent goes on), no and
# stop the turn. Not the ones that write a lasting rule (an exec policy, a network rule): the owner's call.
DECISIONS = {"accept": "Yes", "acceptForSession": "Yes, for this session", "decline": "No", "cancel": "No, and stop"}
NO = ("decline", "cancel")
LEGACY = {"accept": "approved", "acceptForSession": "approved_for_session", "decline": "denied", "cancel": "abort"}


def pending_action(requests: dict[str, Message]) -> PendingAction | None:
    """What the newest request waits on, and the choices to answer it."""
    if not requests:
        return None
    request = list(requests.values())[-1]
    params = request.params
    if request.method in QUESTIONS:
        questions = params.get("questions") if isinstance(params.get("questions"), list) else []
        first = questions[0] if questions and isinstance(questions[0], dict) else {}
        labels = [str(o.get("label")) for o in first.get("options") or [] if isinstance(o, dict)]
        if request.method == "mcpServer/elicitation/request":
            labels = ["Accept", "Decline"]
        detail = str(first.get("question") or params.get("message") or "") or None
        return PendingAction(
            state=AgentState.NEEDS_ANSWER,
            tool_name="request_user_input",
            detail=detail,
            options=[Option(key=str(i), label=label) for i, label in enumerate(labels, 1)],
        )
    offered = params.get("availableDecisions") or ["accept", "acceptForSession", "decline"]
    decisions = [d for d in offered if isinstance(d, str) and d in DECISIONS]
    if request.method == "item/permissions/requestApproval":
        decisions = ["accept", "decline"]
    if not any(d in NO for d in decisions):
        decisions.append("decline")
    what = params.get("command") or params.get("reason") or params.get("grantRoot")
    return PendingAction(
        state=AgentState.NEEDS_PERMISSION,
        tool_name=APPROVALS[request.method],
        detail=" ".join(what) if isinstance(what, list) else (str(what) if what else None),
        options=[Option(key=d, label=DECISIONS[d]) for d in decisions],
        recommended="accept",
    )


def answer(request: Message, option: str | None) -> tuple[dict[str, Any], ItemStatus]:
    """The response to a request, for an option of its `pending_action` (None: say no)."""
    params = request.params
    if request.method == "mcpServer/elicitation/request":
        return {"action": "accept" if option == "1" else "decline", "content": None}, ItemStatus.ANSWERED
    if request.method in QUESTIONS:
        questions = [q for q in params.get("questions") or [] if isinstance(q, dict)]
        if option is None or not questions:
            return {"answers": {}}, ItemStatus.DISMISSED
        labels = [str(o.get("label")) for o in questions[0].get("options") or [] if isinstance(o, dict)]
        picked = labels[int(option) - 1] if option.isdigit() and 0 < int(option) <= len(labels) else option
        return {"answers": {str(questions[0].get("id")): {"answers": [picked]}}}, ItemStatus.ANSWERED
    decision = option or refusal(request)
    status = ItemStatus.DENIED if decision in NO else ItemStatus.ALLOWED
    if request.method == "item/permissions/requestApproval":
        granted = params.get("permissions") if decision not in NO else {}
        return {"permissions": granted or {}, "scope": "turn"}, status
    if request.method in ("execCommandApproval", "applyPatchApproval"):
        return {"decision": LEGACY[decision]}, status
    return {"decision": decision}, status


def refusal(request: Message) -> str:
    """How to say no to a request: "decline" (the agent goes on without it) where offered, else "cancel"."""
    offered = request.params.get("availableDecisions")
    return "cancel" if isinstance(offered, list) and "decline" not in offered and "cancel" in offered else "decline"
