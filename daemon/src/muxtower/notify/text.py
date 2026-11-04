"""What a notification says (pure). The title is the session, like a message's sender, so a shade full of
them reads as a list of sessions; the body starts with what happened or what is wanted, then where it
runs. Agents write Markdown; a notification shows plain text."""

import re

from muxtower.runtimes.models import AgentState
from muxtower.sessions.models import Session

BODY_CHARS = 180
FOLDER_CHARS = 32  # longer folders keep their last two parts
_MARKS = re.compile(r"\*\*|__|`|^#+\s+|^>\s+|^[-*]\s+", re.MULTILINE)
_HOME = re.compile(r"^/(?:home|Users)/[^/]+(?=/|$)|^/root(?=/|$)")


def one_line(text: str, limit: int = BODY_CHARS) -> str:
    flat = " ".join(_MARKS.sub("", text).split())
    return flat if len(flat) <= limit else flat[: limit - 1] + "…"


def place(session: Session) -> str:
    """Where it runs, as far as known: "nas · ~/projects/web"."""
    folder = _HOME.sub("~", session.cwd.rstrip("/")) if session.cwd else ""
    if len(folder) > FOLDER_CHARS:
        folder = "…/" + "/".join(folder.split("/")[-2:])
    return " · ".join(part for part in (session.machine, folder) if part)


def _with_place(what: str, session: Session) -> str:
    where = place(session)
    return f"{what}\n{where}" if where else what


def attention_text(session: Session) -> tuple[str, str]:
    pending = session.pending
    detail = one_line(pending.detail) if pending and pending.detail else ""
    tool = pending.tool_name if pending else None
    match session.state:
        case AgentState.NEEDS_PERMISSION:
            what = f"Approve {tool}: {detail}" if tool and detail else f"Approve {tool or 'a tool call'}"
        case AgentState.NEEDS_ANSWER:
            what = f"Question: {detail}" if detail else "Has a question for you"
        case AgentState.NEEDS_TRUST:
            what = f"Trust prompt: {detail}" if detail else "Asks to trust this folder"
        case AgentState.PLAN_REVIEW:
            what = "Plan ready for review"
        case AgentState.ERROR:
            what = f"Error: {detail}" if detail else "Stopped with an error"
        case _:
            what = "Needs you"
    return session.name, _with_place(what, session)


def done_text(session: Session) -> tuple[str, str]:
    """A finished turn: what it says it left for you, else what it did or said."""
    summary = session.summary
    if summary and summary.needs:
        return session.name, _with_place(f"Done, waiting for you: {one_line(summary.needs)}", session)
    said = (summary and (summary.detail or summary.recent)) or session.reply_summary or session.last_message
    return session.name, _with_place(f"Done: {one_line(said)}" if said else "Finished its turn", session)


def login_expired_text(daemon_name: str) -> tuple[str, str]:
    return "Claude login expired", (
        f"{daemon_name}: sessions from Claude Desktop and the Claude app stop updating here "
        "until you log in again there (claude /login)."
    )


def interrupted_text(daemon_name: str, count: int) -> tuple[str, str]:
    sessions = f"{count} session{'s' if count != 1 else ''}"
    return f"{sessions} interrupted", f"{daemon_name} restarted under them. Open muxtower to start them again."
