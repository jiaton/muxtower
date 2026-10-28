"""Where a Remote Control session came from, read once when it is first seen:

- a fork (Claude Code's fork of a session): tagged `remote-control-fork-parent:session_<id>`;
- a side chat (Claude desktop's "ask on the side"): it starts with a copy of another session's
  history, written in one go and under the same message ids, ending in a note that the owner forked it
  to ask something on the side. Its parent is the listed session whose first message has that id.

Copies without the note count as forks of that parent."""

import logging
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from muxtower.errors import Unavailable
from muxtower.sessions.models import Session
from muxtower.sources.remote_control.ports import RawEvent

if TYPE_CHECKING:
    from muxtower.sources.remote_control.view import RcSession

logger = logging.getLogger("muxtower.remote_control")

FORK_PARENT_TAG = "remote-control-fork-parent:"
SIDE_NOTE = "to ask something on the side"
PAGE = 200
MAX_PAGES = 10  # a copy as long as 2000 events is read to its end; longer, the note is not looked for


@dataclass(frozen=True)
class Lineage:
    first: str | None = None  # its first message's id: a copy's is its parent's
    copied: bool = False  # it began as a copy of another session's history
    side_chat: bool = False
    parent: str | None = None  # named by its tags (a fork)


def tagged_parent(tags: Iterable[Any]) -> str | None:
    for tag in tags:
        if isinstance(tag, str) and tag.startswith(FORK_PARENT_TAG):
            return "cse_" + tag[len(FORK_PARENT_TAG) :].removeprefix("session_").removeprefix("cse_")
    return None


def _texts(event: RawEvent) -> list[str]:
    content = (event.payload.get("message") or {}).get("content")
    if isinstance(content, str):
        return [content]
    return [b.get("text", "") for b in content or [] if isinstance(b, dict) and b.get("type") == "text"]


def read(events_after: Callable[[str, int, int], list[RawEvent]], session_id: str, raw: dict[str, Any]) -> Lineage:
    """Blocking (HTTP). A copy is told by its start: messages written at the very same instant. When the
    log cannot be read, a fork or side chat shows as a session of its own meanwhile."""
    listed = raw.get("tags")
    parent = tagged_parent(listed if isinstance(listed, list) else [])
    try:
        return _read(events_after, session_id, parent)
    except Unavailable as exc:
        logger.warning("could not read where %s came from: %s", session_id, exc)
        return Lineage(parent=parent)


def _read(events_after: Callable[[str, int, int], list[RawEvent]], session_id: str, parent: str | None) -> Lineage:
    events = events_after(session_id, 0, PAGE)
    talk = [e for e in events if e.payload.get("type") in ("user", "assistant")]
    first = str(talk[0].payload.get("uuid") or "") or None if talk else None
    copied = len(talk) > 1 and talk[0].created_at is not None and talk[1].created_at == talk[0].created_at
    if copied:
        burst = talk[0].created_at
        for _ in range(MAX_PAGES):
            for event in events:  # the note comes right after the copy
                if event.payload.get("type") == "user" and any(SIDE_NOTE in t for t in _texts(event)):
                    return Lineage(first, True, True, parent)
                if event.created_at != burst and event.payload.get("type") == "assistant":
                    return Lineage(first, True, False, parent)
            if len(events) < PAGE:
                break
            events = events_after(session_id, max(e.seq for e in events), PAGE)
    return Lineage(first, copied, False, parent)


def forks(sessions: "dict[str, RcSession]") -> dict[str, str]:
    """Each fork's or side chat's parent among the sessions listed."""
    return parents({sid: (s.lineage, str(s.raw.get("created_at") or "")) for sid, s in sessions.items()})


def placed(rc: "RcSession", forks: dict[str, str]) -> Session:
    """Its view, with where it came from."""
    assert rc.view is not None
    parent = forks.get(rc.view.id)
    return (
        rc.view if parent is None else rc.view.model_copy(update={"fork_of": parent, "side_chat": rc.lineage.side_chat})
    )


def parents(lineages: dict[str, tuple[Lineage, str]]) -> dict[str, str]:
    """Each fork's or side chat's parent among those given (session id → (lineage, created_at)): for a
    copy, the oldest other session starting with the same message that is neither a side chat nor a
    tagged fork. (A session can start with its history written at once without being a copy: Remote
    Control turned on midway uploads it. Being the oldest, it is nobody's copy.)"""
    originals: dict[str, tuple[str, str]] = {}
    for session_id, (lineage, created) in lineages.items():
        if lineage.first and not lineage.side_chat and not lineage.parent:
            known = originals.get(lineage.first)
            if known is None or created < known[1]:
                originals[lineage.first] = (session_id, created)
    found = {}
    for session_id, (lineage, _) in lineages.items():
        original = originals.get(lineage.first or "")
        if lineage.parent:
            found[session_id] = lineage.parent
        elif lineage.copied and original and original[0] != session_id:
            found[session_id] = original[0]
    return found
