"""Tools on a session that runs on another machine. On a node, a session id it does not know may be one
its hub lists (the hub's own, or another node's): the node asks the hub, which reaches every session, as it
does for the team tools (`nodes/asked.py`). The caller stays the node's session (`<node>~<id>` there)."""

from collections.abc import Callable
from typing import Any

from pydantic import BaseModel

from muxtower.errors import Invalid, NotFound, Unavailable
from muxtower.mcp.caller import CALLER

Forward = Callable[[str, dict[str, Any], str | None], str | None]


def reaching(name: str, run: Callable[[Any], str], forward: Forward | None) -> Callable[[Any], str]:
    """`run`, or (a session not on this machine) the same tool asked of the hub."""

    def wrapped(args: BaseModel) -> str:
        try:
            return run(args)
        except NotFound as missing:
            session_id = getattr(args, "session_id", None)
            if forward is None or session_id is None:
                raise
            try:
                answered = forward(name, args.model_dump(), CALLER.get().session_id)
            except Unavailable as exc:
                raise Unavailable(
                    f"{session_id} is not on this machine, and its hub cannot be asked now ({exc})"
                ) from exc
            except Invalid as exc:
                if "no team tool" in str(exc):
                    raise Unavailable(
                        f"{session_id} is not on this machine, and the hub runs an older muxtower that cannot reach "
                        "it for you: update the hub"
                    ) from exc
                raise
            if answered is None:  # no hub: it is nowhere
                raise missing
            return answered

    return wrapped
