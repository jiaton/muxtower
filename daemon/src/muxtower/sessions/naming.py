"""Which name a session goes by: the latest deliberate one wins.

- A name muxtower gave it (at launch, or a rename later) beats one its agent made up itself (Claude
  Code's `nameSource: "derived"`, a Remote Control title it generated).
- A name the owner set on the agent's side (claude.ai, the Claude app, `/rename`: `nameSource: "user"`)
  that is newer than muxtower's naming beats it; a later rename in muxtower wins again.
- A name whose source or time is not known never replaces one muxtower gave, at launch or since: a
  Remote Control title (claude.ai regenerates those by itself, and says nothing of who set one), or a
  name first seen already set on the agent's side. A name the owner sets in the Claude app shows in
  muxtower once renamed there too. A session muxtower never named goes by its agent's name.
  An agent starting a teammate with a name (`start_session(name=…)`) chose it on purpose: explicit."""

from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from muxtower.sessions.ports import SessionRecord


def seen(record: "SessionRecord", title: str | None, origin: "AgentName | None", now: datetime) -> bool:
    """Notes the name a person gave the session on the agent's side, and when it changed to it; True when
    the record changed. The agent's own `since` is not believed: Claude Code stamps it anew each time it
    starts and restores an old name. The first one seen was set at a time not known."""
    if not title or origin is None or origin.source != "user" or title == record.agent_name:
        return False
    record.agent_name_at = now if record.agent_name is not None else None
    record.agent_name = title
    return True


def as_seen(record: "SessionRecord", title: str | None, origin: "AgentName | None") -> "AgentName | None":
    """The agent's naming as muxtower saw it happen, in place of the time the agent says."""
    if origin is not None and origin.source == "user" and title == record.agent_name:
        return AgentName("user", record.agent_name_at)
    return origin


@dataclass(frozen=True)
class AgentName:
    """Where the agent's own name for the session came from: "user" or "derived", and since when."""

    source: str
    since: datetime | None = None


def chosen(record: "SessionRecord", title: str | None, origin: AgentName | None) -> tuple[str, bool]:
    """(the name to show, whether it is muxtower's own: kept over a Remote Control title too)."""
    named = record.named or record.named_at is not None  # muxtower gave it this name, at launch or since
    if title and origin and origin.source == "user" and origin.since is not None:
        if record.named_at is None or origin.since > record.named_at:
            return title, False  # the owner named it there, seen to change after muxtower named it
        return record.name, True
    if named:  # over one it made up, and over one whose source or time is not known
        return record.name, True
    return (title or record.name), False
