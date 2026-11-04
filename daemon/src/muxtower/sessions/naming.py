"""Which name a session goes by: the latest deliberate one wins.

- A name muxtower gave it (at launch, or a rename later) beats one its agent made up itself (Claude
  Code's `nameSource: "derived"`, a Remote Control title it generated).
- A name the owner set on the agent's side (claude.ai, the Claude app, `/rename`: `nameSource: "user"`)
  that is newer than muxtower's naming beats it; a later rename in muxtower wins again.
- When the agent's side says neither where its name came from nor since when (a Remote Control title
  alone), only an explicit rename counts (`named`): a name given at launch stays until the agent gives one.
  An agent starting a teammate with a name (`start_session(name=…)`) chose it on purpose: explicit too."""

from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from muxtower.sessions.ports import SessionRecord


@dataclass(frozen=True)
class AgentName:
    """Where the agent's own name for the session came from: "user" or "derived", and since when."""

    source: str
    since: datetime | None = None


def chosen(record: "SessionRecord", title: str | None, origin: AgentName | None) -> tuple[str, bool]:
    """(the name to show, whether it is muxtower's own: kept over a Remote Control title too)."""
    if title and origin and origin.source == "user":
        if origin.since is None:  # set there, nobody knows when: only an explicit rename beats it
            return (record.name, True) if record.named else (title, False)
        if record.named_at is None or origin.since > record.named_at:
            return title, False  # the owner named it there, after muxtower did
        return record.name, True
    if record.named or (record.named_at is not None and title and origin is not None):  # over one it made up
        return record.name, True
    return (title or record.name), False
