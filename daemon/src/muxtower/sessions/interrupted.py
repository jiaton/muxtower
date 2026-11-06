"""Sessions whose machine restarted under them: told apart from those that ended, kept, and started again.

A session is interrupted, not ended, when the tmux server it ran in is no longer there: another one runs on
its socket (the machine, or tmux, restarted), or none does and this daemon never saw its server alive (when
it did, the session was that server's last pane, and the server went with it). When it cannot tell, it
keeps the session. What starts
one again is kept from its start: the options it was started with (never its first prompt, never a
token) and the agent's own id for its conversation, resumed (`claude --resume <id>`, `codex resume <id>`)."""

import os
import re

from muxtower.runtimes.models import AgentState
from muxtower.runtimes.spec import RuntimeConfig
from muxtower.sessions.models import Capabilities, Session, StateSource
from muxtower.sessions.ports import SessionRecord

UUID_AT_END = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

# Nothing runs: it can only be resumed (`/v1/recovery`) or removed (terminate).
STOPPED = Capabilities(screen=False, conversation=False, keys=[], resize=False, terminate=True, rename=False)


def launch_options(args: list[str], config: RuntimeConfig) -> list[str]:
    """The options among `args` (with the values they take), without a prompt or an earlier resume."""
    kept: list[str] = []
    takes_value = set(config.option_values)
    resume = set(config.resume)
    i = 0
    while i < len(args):
        arg = args[i]
        if arg in resume or any(arg.startswith(f"{r}=") for r in resume if r.startswith("-")):
            i += 1 if "=" in arg else 2  # an earlier resume: it is resumed by its id now
            continue
        if not arg.startswith("-"):
            i += 1  # a prompt (or a subcommand): not sent again
            continue
        kept.append(arg)
        # Its value, when one follows (an option whose value is optional, a bare `--remote-control`, takes
        # no other option for it).
        if arg in takes_value and i + 1 < len(args) and not args[i + 1].startswith("-"):
            kept.append(args[i + 1])
            i += 1
        i += 1
    return kept


def resume_args(record: SessionRecord, config: RuntimeConfig) -> list[str]:
    """The arguments it is started again with: its options, then its conversation resumed when known."""
    options = list(record.launch_args or [])
    return [*options, *config.resume, record.agent_id] if record.agent_id and config.resume else options


def gone(record: SessionRecord, server: str | None, seen: str | None) -> str:
    """What became of a session whose pane is no longer listed: "ended" or "interrupted". `server` is the
    tmux server on its socket now, `seen` the one this daemon saw alive there since it started."""
    if record.server_id is None:
        return "interrupted"  # where it ran is not known: kept
    if server is not None:
        return "ended" if server == record.server_id else "interrupted"  # closed, or a new server
    # No server: the last pane of its server closed (the server went with it), or the machine restarted.
    return "ended" if seen == record.server_id else "interrupted"


def agent_id_of(transcript: str | None) -> str | None:
    """The agent's own id for a session, from its transcript's name (Claude Code: `<id>.jsonl`; Codex:
    `rollout-<time>-<thread id>.jsonl`)."""
    found = UUID_AT_END.search(os.path.basename(transcript or "").removesuffix(".jsonl"))
    return found.group(0) if found else None


def interrupted_view(record: SessionRecord) -> Session:
    return Session(
        id=record.id, name=record.name, runtime=record.runtime, cwd=record.cwd, source=record.source,
        tmux_socket=record.pane.socket, capabilities=STOPPED, state=AgentState.UNKNOWN,
        state_source=StateSource.DEFAULT, matched_rule=None, needs_attention=False, pending=None, last_message=None,
        auto_approve=record.auto_approve, can_auto_approve=False, created_at=record.created_at,
        updated_at=record.interrupted_at or record.created_at, interrupted_at=record.interrupted_at,
    )  # fmt: skip
