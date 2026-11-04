"""Starting again the sessions whose machine restarted under them (`sessions/interrupted.py` tells them
apart and keeps them). Each is started in its folder with the options it was started with, resuming its
conversation, under its own id: its name, marks, role, project and tasks stay with it. Nothing is sent to
it, so it does not carry on working by itself.

`recovery.mode`: ask (the app lists them, all ticked, and the owner starts again those they keep ticked;
a push says so), auto (started again as soon as they are found), off (let go, as before). A node keeps
and starts its own: the hub asks it over the link (`recover`)."""

import asyncio
import logging
from collections.abc import Callable
from typing import Any

from muxtower.config import RecoverySettings
from muxtower.errors import Conflict, NotFound
from muxtower.infra.bus import EventBus
from muxtower.sessions.interrupted import resume_args
from muxtower.sessions.models import Session
from muxtower.sessions.service import SessionService

logger = logging.getLogger("muxtower.recovery")

CHECK_SECONDS = 30.0  # besides every change of the session list


class RecoveryService:
    def __init__(
        self, sessions: SessionService, settings: RecoverySettings,
        on_node: Callable[[str], bool] = lambda _: False, ask_node: Callable[[str], Session] | None = None,
    ) -> None:  # fmt: skip
        self.sessions = sessions
        self.settings = settings
        self.on_node = on_node  # a node's session, as the hub lists it
        self.ask_node = ask_node  # starts one again on its node
        self._told: set[str] = set()  # interrupted sessions already handled for `mode`

    def interrupted(self) -> list[Session]:
        """The sessions here that wait to be started again."""
        return [self.sessions.view(r) for r in self.sessions.repo.list() if r.interrupted_at]

    def recover(self, session_ids: list[str]) -> list[Session]:
        """Blocking. Starts each again (here, or on its node); those that are not interrupted are skipped."""
        started = []
        for session_id in dict.fromkeys(session_ids):
            if self.on_node(session_id):
                if self.ask_node is None:
                    raise Conflict(f"{session_id} runs on a node, which this daemon cannot ask")
                started.append(self.ask_node(session_id))
                continue
            record = self.sessions.repo.get(session_id)
            if record is None:
                raise NotFound(f"unknown session {session_id}")
            if record.interrupted_at is None:
                continue  # running already (started again by someone else meanwhile)
            runtime = self.sessions.runtime_of(record)
            if runtime is None:
                raise Conflict(f"{record.runtime} is no longer a runtime here")
            args = resume_args(record, runtime.config)
            logger.info("starting %s (%s) again: %s", record.id, record.name, " ".join(args) or "(no arguments)")
            started.append(self.sessions.launch(runtime, record.cwd, args, None, hooks=True, again=record))
        return started

    def check(self) -> int:
        """Blocking. Handles the newly interrupted by `mode`; returns how many the owner is to be asked about."""
        found = {s.id for s in self.interrupted()}
        new = sorted(found - self._told)
        self._told &= found
        if not new:
            return 0
        self._told |= set(new)
        if self.settings.mode == "auto":
            self.recover(new)
            return 0
        if self.settings.mode == "off":
            for session_id in new:
                self.sessions.forget(session_id)
            return 0
        return len(new)

    async def run_loop(self, bus: EventBus) -> None:
        queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        bus.subscribe("sessions", queue)
        while True:
            try:
                asked = await asyncio.to_thread(self.check)
                if asked:
                    bus.publish("recovery:interrupted", asked)
                    bus.publish("sessions", None)
            except Exception:
                logger.exception("could not look at interrupted sessions")
            try:
                await asyncio.wait_for(queue.get(), CHECK_SECONDS)
            except TimeoutError:
                pass
