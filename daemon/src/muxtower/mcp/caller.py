"""Who is calling a tool: a device (its token's name), or one of the sessions muxtower started, which reach
it with their own token (`session.<id>.<hook token>`, written into their MCP config when they start)."""

from contextvars import ContextVar
from dataclasses import dataclass

from muxtower.hooks.ports import SESSION_TOKEN_PREFIX


@dataclass(frozen=True)
class Caller:
    actor: str  # as the audit log names it
    session_id: str | None = None  # the session calling, when it reached muxtower as itself


CALLER: ContextVar[Caller] = ContextVar("mcp_caller", default=Caller("unknown"))


def parse_session_token(presented: str) -> tuple[str, str] | None:
    if not presented.startswith(SESSION_TOKEN_PREFIX):
        return None
    session_id, _, hook_token = presented[len(SESSION_TOKEN_PREFIX) :].partition(".")
    return (session_id, hook_token) if session_id and hook_token else None
