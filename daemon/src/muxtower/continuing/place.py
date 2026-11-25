"""Where a Remote Control session's conversation is on the machine it runs on: read there (the hub's own
machine, or a node asked over the link: `claude_conversation`). Claude Code's process file for it names the
conversation (`sessionId`) and its folder; its transcript is `projects/<folder>/<id>.jsonl`, or where that
went on (`continued-in`), which is what is resumed."""

from typing import Any

from muxtower.continuing.ports import Place
from muxtower.sessions.interrupted import agent_id_of


def look(processes: Any, remote_id: str | None, agent_id: str | None) -> Place:
    """Blocking (files). By its Remote Control id while a process file names it, else by the conversation's
    own id (once known: a Retry after the Claude app let go of it)."""
    found = processes.conversation_of(remote_id) if remote_id and hasattr(processes, "conversation_of") else None
    agent = agent_id or (found[0] if found else None)
    if agent is None:
        return Place(None, None, False, False)
    transcript = processes.transcript_for(agent) if hasattr(processes, "transcript_for") else None
    # Where it went on, if it did (a move to the background): that is the conversation now.
    resumed = agent_id_of(transcript) or agent
    holds = getattr(processes, "holds", None)
    live = bool(holds and any(holds(a) for a in dict.fromkeys((agent, resumed))))
    return Place(resumed, (found[1] if found else None) or None, transcript is not None, live)
