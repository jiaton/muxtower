"""Inbox items as text for an agent: about one line each, with ids and versions (`read_inbox`, the nudge)."""

from muxtower.inbox.models import InboxItem, OnDue


def _clip(text: str, chars: int) -> str:
    text = " ".join(text.split())
    return text if len(text) <= chars else text[: chars - 1] + "…"


def line(i: InboxItem) -> str:
    """One item in one line, for an agent: id, version, status, project, due, text."""
    parts = [f"#{i.id} v{i.version}", i.status.value]
    if i.project:
        parts.append(i.project)
    if i.handed:
        parts.append(f"handed to {i.handed.to_role or i.handed.to_session} ({i.handed.at:%m-%d})")
    if i.due:
        fmt = "%Y-%m-%d %H:%M" if i.due_has_time else "%Y-%m-%d"
        then = f"due {i.due.astimezone():{fmt}} ({i.due_state.value}"
        if i.on_due is OnDue.HAND_OFF and i.due_target:
            then += f", then to {i.due_target.role or i.due_target.session_id}@{i.due_target.project}"
        parts.append(then + ")")
    return " · ".join(parts) + f": {_clip(i.text, 160)}"


def render(items: list[InboxItem]) -> str:
    return "\n".join(line(i) for i in items)
