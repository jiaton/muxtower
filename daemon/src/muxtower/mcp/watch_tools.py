"""watch_session, unwatch_session and list_events for whoever calls them: a session watches for itself
(`sessions/watches.py`), the concierge as it always has (`concierge/`). A caller that is no session (a
device token) watches for the concierge when there is one; without it there is no one to tell."""

from muxtower.concierge.service import ConciergeService
from muxtower.errors import Invalid, NotFound
from muxtower.mcp.caller import CALLER
from muxtower.mcp.tool import Tool
from muxtower.sessions.watches import SessionWatches

NO_ONE = "watching needs a session to tell: call it from an agent session muxtower started (or the concierge)"


class WatchTools:
    def __init__(self, concierge: ConciergeService | None, watches: SessionWatches | None) -> None:
        self.concierge = concierge
        self.watches = watches

    def _watcher(self) -> str | None:
        """The session to tell, or None for the concierge's own watching."""
        caller = CALLER.get().session_id
        if caller is None or (self.concierge is not None and caller == self.concierge.session_id):
            if self.concierge is None:
                raise Invalid(NO_ONE)
            return None
        if self.watches is None:
            raise Invalid(NO_ONE)
        return caller

    def watch(self, session_id: str) -> str:
        watcher = self._watcher()
        if watcher is None:
            assert self.concierge is not None
            return f"Watching {self.concierge.watch(session_id).name}."
        assert self.watches is not None
        s = self.watches.watch(watcher, session_id)
        return f"Watching {s.name}: you are told when it finishes a turn, needs the owner or ends."

    def unwatch(self, session_id: str) -> str:
        watcher = self._watcher()
        if watcher is None:
            assert self.concierge is not None
            self.concierge.unwatch(session_id)
        else:
            assert self.watches is not None
            if not self.watches.unwatch(watcher, session_id) and self.watches.directory.find(session_id) is None:
                raise NotFound(f"unknown session {session_id}")  # watched through the hub, if anywhere
        return "Stopped watching."

    def list_events(self, after: int) -> str:
        watcher = self._watcher()
        if watcher is None:
            assert self.concierge is not None
            found = [(e.number, e.line, e.delivered) for e in self.concierge.recorded(after)]
        else:
            assert self.watches is not None
            found = [(t.number, t.line, t.delivered) for t in self.watches.recorded(watcher, after)]
        if not found:
            return f"No events after #{after}."
        out = [line + ("" if told else " (not sent to you yet)") for _, line, told in found]
        if len(found) == 50:
            out.append(f"More: list_events(after={found[-1][0]})")
        return "\n".join(out)


def watch_tools(tools: WatchTools, session_arg: type, events_arg: type) -> list[Tool]:
    return [
        Tool("watch_session", "Be told (a [muxtower event #N · time] line with its id, state and where its new "
             "items start, typed into your session once you show no prompt) when this session finishes a turn, "
             "needs the owner or ends.", session_arg, lambda a: tools.watch(a.session_id)),
        Tool("unwatch_session", "Stop being told about this session.", session_arg,
             lambda a: tools.unwatch(a.session_id)),
        Tool("list_events", "The [muxtower event] lines recorded for you after an event number, to catch up when "
             "one may be missed.", events_arg, lambda a: tools.list_events(a.after)),
    ]  # fmt: skip
