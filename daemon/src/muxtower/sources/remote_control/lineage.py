"""Where a Remote Control session came from, read once when it is first seen:

- a fork (Claude Code's fork of a session): tagged `remote-control-fork-parent:session_<id>`;
- a side chat (Claude desktop's "ask on the side"): it starts with a copy of another session's
  history, written in one go (a long one in batches of a hundred, a moment apart) and under the same
  message ids, ending in a note that the owner forked it
  to ask something on the side. Its parent is the listed session whose first message has that id, or,
  when that one was compacted since (the copy starts after its summary), the newest older session with
  the same title (a side chat keeps its parent's).

Copies without the note count as forks of that parent. Claude desktop's fork carries no tag (and the API
names no parent: `relations` is empty), and one made from the middle of a session starts at that message, not
at the parent's first: such a copy's parent is the newest older session with its title, less the " (fork)"
Claude desktop adds, whose log holds its first message (looked for once, `holds`, from the newest events
back: a fork is mostly taken late in a long session). Forks are often renamed, and then no title is shared:
the sessions that were already there and still going when the copied message was written (a copy keeps
each message's own `timestamp`) are searched too, after those of its title."""

import logging
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta
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
HOLDS_PAGES = 100  # a log searched for a copy's first message: its last 20000 events (once per copy)
FORK_SUFFIX = " (fork)"
WRITTEN_SLACK = timedelta(hours=1)  # a log read back to this long before a copy's first message was written


def base_title(title: str) -> str:
    """A title without the " (fork)" Claude desktop adds to a fork's (a fork of a fork has two)."""
    title = title.strip()
    while title.endswith(FORK_SUFFIX):
        title = title[: -len(FORK_SUFFIX)].rstrip()
    return title


COPY_GAP = 2.0  # seconds: a copy's batches follow each other closer than this (seen: under half a second)


@dataclass(frozen=True)
class Lineage:
    first: str | None = None  # its first message's id: a copy's is its parent's
    copied: bool = False  # it began as a copy of another session's history
    side_chat: bool = False
    parent: str | None = None  # named by its tags (a fork)
    searched: bool = False  # a copy no first message places: the sessions of its title were searched
    found_in: str | None = None  # the session whose log holds its first message, when searched
    written: str | None = None  # a copy's: when its first message was written, in the session it came from
    complete: bool = True  # False: its log could not be read (not kept: read again on the next start)


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


def _at(event: RawEvent) -> datetime | None:
    try:
        return datetime.fromisoformat(event.created_at) if event.created_at else None
    except ValueError:
        return None


def read(events_after: Callable[[str, int, int], list[RawEvent]], session_id: str, raw: dict[str, Any]) -> Lineage:
    """Blocking (HTTP). A copy is told by its start: messages written at the very same instant. It ends at
    the first pause; the note, if any, comes right after it. When the log cannot be read, a fork or side
    chat shows as a session of its own meanwhile."""
    listed = raw.get("tags")
    parent = tagged_parent(listed if isinstance(listed, list) else [])
    try:
        return _read(events_after, session_id, parent)
    except Unavailable as exc:
        logger.warning("could not read where %s came from: %s", session_id, exc)
        return Lineage(parent=parent, complete=parent is not None)  # a tag says it all


def _read(events_after: Callable[[str, int, int], list[RawEvent]], session_id: str, parent: str | None) -> Lineage:
    events = events_after(session_id, 0, PAGE)
    talk = [e for e in events if e.payload.get("type") in ("user", "assistant")]
    first = str(talk[0].payload.get("uuid") or "") or None if talk else None
    copied = len(talk) > 1 and talk[0].created_at is not None and talk[1].created_at == talk[0].created_at
    written = str(talk[0].payload.get("timestamp") or "") or None if copied else None
    if copied:
        last, past = _at(talk[0]), False
        for _ in range(MAX_PAGES):
            for event in events:  # the note comes right after the copy
                if event.payload.get("type") == "user" and any(SIDE_NOTE in t for t in _texts(event)):
                    return Lineage(first, True, True, parent, written=written)
                at = _at(event)
                past = past or bool(at and last and (at - last).total_seconds() > COPY_GAP)
                if past and event.payload.get("type") == "assistant":
                    return Lineage(first, True, False, parent, written=written)
                last = at or last
            if len(events) < PAGE:
                break
            events = events_after(session_id, max(e.seq for e in events), PAGE)
    return Lineage(first, copied, False, parent, written=written)


def listed(sessions: "dict[str, RcSession]") -> dict[str, tuple[Lineage, str, str]]:
    return {
        sid: (s.lineage, str(s.raw.get("created_at") or ""), str(s.raw.get("title") or ""))
        for sid, s in sessions.items()
    }


def forks(sessions: "dict[str, RcSession]") -> dict[str, str]:
    """Each fork's or side chat's parent among the sessions listed."""
    return parents(listed(sessions))


def _when(value: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(value) if value else None
    except ValueError:
        return None


def _going(created: str, last: str | None, at: datetime) -> bool:
    """Whether a session was already there, and still going, at that time."""
    began, ended = _when(created), _when(last)
    return bool(began and began <= at and (ended is None or ended >= at))


def to_search(
    lineages: dict[str, tuple[Lineage, str, str]], last_active: dict[str, str] | None = None
) -> dict[str, list[str]]:
    """Copies that no first message places and that were not searched yet, each with the sessions that may
    hold its first message, among those older that are neither side chats nor tagged forks: first those of
    its title ("(fork)" suffixes aside), then (a fork renamed since) the others that were already there and
    still going (`last_active`: each one's last event) when its first message was written; each newest
    first. Only one that does is its parent, so an equal title alone never makes one."""
    placed = parents(lineages)
    last_active = last_active or {}
    found: dict[str, list[str]] = {}
    for session_id, (lineage, created, title) in lineages.items():
        if not lineage.copied or lineage.side_chat or lineage.parent or lineage.searched or not lineage.first:
            continue
        if session_id in placed:
            continue
        older = [
            (c, sid) for sid, (other, c, _) in lineages.items()
            if sid != session_id and c < created and not other.side_chat and not other.parent
        ]  # fmt: skip
        same = [o for o in older if title and base_title(lineages[o[1]][2]) == base_title(title)]
        # The title it was forked from first (its own, one " (fork)" less: a fork of a fork names the fork),
        # then the others of that base title.
        named = title.strip().removesuffix(FORK_SUFFIX).rstrip()
        ranked = sorted(same, key=lambda o: (lineages[o[1]][2].strip() == named, o[0]), reverse=True)
        written = _when(lineage.written)
        if written is not None:
            others = [o for o in older if o not in same and _going(o[0], last_active.get(o[1]), written)]
            ranked += sorted(others, reverse=True)
        found[session_id] = [sid for _, sid in ranked]
    return found


def search(
    events_after: Callable[[str, int, int], list[RawEvent]],
    searches: dict[str, list[str]],
    firsts: dict[str, str | None],
    events_before: Callable[[str, int | None, int], list[RawEvent]] | None = None,
    written: dict[str, str | None] | None = None,
) -> dict[str, str | None]:
    """Blocking (HTTP). For each copy to search (`to_search`) that has candidates, the first of them whose
    log holds its first message, or None; a copy whose search failed is left out, to be searched again.
    With when that message was written (`written`), a log is read back only to then."""
    found: dict[str, str | None] = {}
    for copy_id, candidates in searches.items():
        first = firsts.get(copy_id)
        if not first or not candidates:
            continue  # none to search yet: a parent listed later is still found
        at = _when((written or {}).get(copy_id))
        since = at - WRITTEN_SLACK if at else None
        try:
            found[copy_id] = next((c for c in candidates if holds(events_after, c, first, events_before, since)), None)
        except Unavailable as exc:
            logger.warning("could not look for where %s came from: %s", copy_id, exc)
    return found


def holds(
    events_after: Callable[[str, int, int], list[RawEvent]],
    session_id: str,
    message_id: str,
    events_before: Callable[[str, int | None, int], list[RawEvent]] | None = None,
    since: datetime | None = None,
) -> bool:
    """Blocking (HTTP). Whether a session's log has that message: read from its newest events back (a fork
    is mostly taken late in a long session), up to HOLDS_PAGES pages, and (`since`: the message was written
    after then) no further back than events from before then; without `events_before`, from its oldest
    on, as far."""
    if events_before is not None:
        before: int | None = None
        for _ in range(HOLDS_PAGES):
            events = events_before(session_id, before, PAGE)
            if any(str(e.payload.get("uuid") or "") == message_id for e in events):
                return True
            if len(events) < PAGE:
                return False
            oldest = min((t for e in events if (t := _at(e)) is not None), default=None)
            if since is not None and oldest is not None and oldest < since:
                return False
            before = min(e.seq for e in events)
        return False
    seq = 0
    for _ in range(HOLDS_PAGES):
        events = events_after(session_id, seq, PAGE)
        if any(str(e.payload.get("uuid") or "") == message_id for e in events):
            return True
        if len(events) < PAGE:
            return False
        seq = max(e.seq for e in events)
    return False


def placed(rc: "RcSession", forks: dict[str, str]) -> Session:
    """Its view, with where it came from."""
    assert rc.view is not None
    parent = forks.get(rc.view.id)
    return (
        rc.view if parent is None else rc.view.model_copy(update={"fork_of": parent, "side_chat": rc.lineage.side_chat})
    )


def parents(lineages: dict[str, tuple[Lineage, str, str]]) -> dict[str, str]:
    """Each fork's or side chat's parent among those given (session id → (lineage, created_at, title)):
    for a copy, the oldest other session starting with the same message that is neither a side chat nor
    a tagged fork (a session whose history was uploaded at once, Remote Control turned on midway, is the
    oldest, so nobody's copy); for a side chat whose parent was compacted since, the newest older such
    session with its title."""
    originals: dict[str, tuple[str, str]] = {}
    for session_id, (lineage, created, _) in lineages.items():
        if lineage.first and not lineage.side_chat and not lineage.parent:
            known = originals.get(lineage.first)
            if known is None or created < known[1]:
                originals[lineage.first] = (session_id, created)
    found = {}
    for session_id, (lineage, created, title) in lineages.items():
        original = originals.get(lineage.first or "")
        if lineage.parent:
            found[session_id] = lineage.parent
        elif lineage.copied and original and original[0] != session_id:
            found[session_id] = original[0]
        elif lineage.found_in:
            found[session_id] = lineage.found_in
        elif lineage.side_chat and title:
            older = [
                (c, sid) for sid, (other, c, t) in lineages.items()
                if sid != session_id and base_title(t) == base_title(title) and c < created
                and not other.side_chat and not other.parent
            ]  # fmt: skip
            if older:
                found[session_id] = max(older)[1]
    return found
