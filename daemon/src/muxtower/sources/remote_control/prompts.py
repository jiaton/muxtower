"""Answering a Remote Control session's prompt: a permission (allow or deny) or a question (one option, or
all of its questions at once)."""

from muxtower.approval.answers import check_answers
from muxtower.claude_conversation import PendingRequest
from muxtower.errors import Invalid
from muxtower.runtimes.models import AgentState
from muxtower.sessions.models import Session
from muxtower.sources.remote_control.ports import RemoteControlPort

DENY_MESSAGE = "Denied from muxtower."


def approve(
    port: RemoteControlPort, session_id: str, request: PendingRequest, view: Session, option: str | None,
    answers: list[list[str]] | None,
) -> tuple[AgentState, str]:  # fmt: skip
    if request.is_question and answers is not None:
        questions = view.pending.questions if view.pending else []
        picked = check_answers(questions, answers)
        said = {q.question: ", ".join(p) for q, p in zip(questions, picked, strict=True)}  # Claude Code's joining
        port.answer_question(
            session_id, request.request_id, said, tool_input=request.tool_input, tool_use_id=request.tool_use_id
        )
        return view.state, "answers"
    if request.is_question:
        options = {o.key: o.label for o in (view.pending.options if view.pending else [])}
        if option not in options:
            raise Invalid("pick one of the offered answers")
        question = str(request.question.get("question") or "")
        port.answer_question(
            session_id, request.request_id, {question: options[option]},
            tool_input=request.tool_input, tool_use_id=request.tool_use_id,
        )  # fmt: skip
        return view.state, option
    if option not in (None, "allow", "deny"):
        raise Invalid("option must be allow or deny")
    allow = option != "deny"
    port.respond_permission(
        session_id, request.request_id, allow=allow, tool_input=request.tool_input,
        tool_use_id=request.tool_use_id, message=None if allow else DENY_MESSAGE,
    )  # fmt: skip
    return view.state, "allow" if allow else "deny"


def deny(port: RemoteControlPort, session_id: str, request: PendingRequest, view: Session) -> AgentState:
    if request.is_question:
        port.answer_question(
            session_id, request.request_id, {}, tool_input=request.tool_input, tool_use_id=request.tool_use_id
        )
    else:
        port.respond_permission(
            session_id, request.request_id, allow=False, tool_input=request.tool_input,
            tool_use_id=request.tool_use_id, message=DENY_MESSAGE,
        )  # fmt: skip
    return view.state
