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


OLDER_HUB = "the hub runs an older muxtower that lists no other machine for a node: update the hub"


def _asked(name: str, args: BaseModel, forward: Forward) -> str | None:
    """The hub's answer (None: this daemon is no node). Unavailable, saying why, when it cannot be asked."""
    try:
        return forward(name, args.model_dump(), CALLER.get().session_id)
    except Invalid as exc:
        if "no team tool" in str(exc):
            raise Unavailable(OLDER_HUB) from exc
        raise


def listing_everywhere(name: str, run: Callable[[Any], str], forward: Forward | None) -> Callable[[Any], str]:
    """list_sessions on a node: the hub's list, of every machine; without the hub, this machine's, saying
    why the others are missing (an agent shown only this machine took the others for having no muxtower)."""

    def wrapped(args: BaseModel) -> str:
        if forward is None:
            return run(args)
        try:
            answered = _asked(name, args, forward)
        except Unavailable as exc:
            return f"NOTE: {exc}. Only this machine's sessions:\n{run(args)}"
        return run(args) if answered is None else answered

    return wrapped


def starting_anywhere(run: Callable[[Any], str], forward: Forward | None, here: str) -> Callable[[Any], str]:
    """start_session on a node: here when it names no machine or this one; on another, through the hub."""

    def wrapped(args: BaseModel) -> str:
        machine = (getattr(args, "machine", None) or "").strip().removeprefix("@").lower()
        if forward is None or not machine or machine == here.lower():
            return run(args)
        try:
            answered = _asked("start_session", args, forward)
        except Unavailable as exc:
            raise Unavailable(f"{machine} is not this machine, and {exc}; nothing was started") from exc
        return run(args) if answered is None else answered

    return wrapped


def events_everywhere(run: Callable[[Any], str], forward: Forward | None) -> Callable[[Any], str]:
    """list_events on a node: what this machine recorded for the caller (sessions here it watches), then
    what its hub did (sessions elsewhere, watched through it); each numbers its own."""

    def wrapped(args: BaseModel) -> str:
        here = run(args)
        if forward is None:
            return here
        try:
            answered = _asked("list_events", args, forward)
        except Unavailable as exc:
            return f"{here}\nNOTE: {exc}. Events of sessions on other machines are kept by the hub."
        if answered is None or answered.startswith("No events after"):
            return here
        return (
            answered
            if here.startswith("No events after")
            else f"{here}\nFrom the hub (sessions elsewhere):\n{answered}"
        )

    return wrapped
