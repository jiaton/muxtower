"""Firing a trigger: paused? → filter → dedupe → rate → its action → logged (`store.record`).

Every firing is taken and logged with what became of it (models.Outcome), a paused trigger's too, so the
owner sees what was missed. The owner hears of trouble by push, at most once an hour per trigger and kind
(over the rate limit; a deliver target gone)."""

import logging
import threading
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from muxtower.errors import Conflict, Invalid, NotFound
from muxtower.mcp.session_tools import StartArgs
from muxtower.teams.tasks import TaskService
from muxtower.triggers import framing
from muxtower.triggers.models import DeliverAction, Firing, NotifyAction, Outcome, StartAction, Trigger, Via
from muxtower.triggers.rules import MISSING, field, text_of
from muxtower.triggers.rules import failing as failing_condition
from muxtower.triggers.store import TriggerStore

logger = logging.getLogger("muxtower.triggers")

PASSED: tuple[str, ...] = ("delivered", "started", "notified", "failed")  # what counts toward the rate
MAX_STARTED = 3  # sessions one trigger started that may be alive at once
PUSH_GAP = timedelta(hours=1)  # between two pushes of one kind about one trigger


class TriggerService:
    def __init__(
        self, store: TriggerStore, tasks: TaskService | None = None,
        start: Callable[[StartArgs, str], str] | None = None, alive: Callable[[str], bool] = lambda _: False,
        push: Callable[[str, str], int] = lambda _name, _body: 0,
    ) -> None:  # fmt: skip
        self.store = store
        self.tasks = tasks  # a deliver goes as a team task
        self.start = start  # starts a session as MCP start_session does; returns its id
        self.alive = alive  # whether a session still runs (not archived, not gone)
        self.push = push  # (trigger name, text) to the owner's devices; how many it reached
        self.now: Callable[[], datetime] = lambda: datetime.now(UTC)
        self._pushed: dict[tuple[str, str], datetime] = {}  # (trigger id, kind) → when last pushed
        self._lock = threading.Lock()

    def fire(self, trigger: Trigger, payload: Any, key: str | None, via: Via, size: int) -> Firing:
        """Blocking. What became of one event."""
        outcome, target, detail = self._decide(trigger, payload, key)
        firing = Firing(
            id=0, trigger_id=trigger.id, at=self.now(), via=via, key=key, outcome=outcome, target=target,
            detail=detail, bytes=size,
        )  # fmt: skip
        return self.store.record(firing)

    def _decide(self, trigger: Trigger, payload: Any, key: str | None) -> tuple[Outcome, str | None, str]:
        if not trigger.enabled:
            return "paused", None, "paused"
        if (failed := failing_condition(trigger.filter, payload)) is not None:
            return "filtered", None, f"filtered: {failed.field} {failed.op} {failed.value}"
        if trigger.dedupe is not None:
            dedupe_key = key
            if trigger.dedupe.field and (value := field(payload, trigger.dedupe.field)) is not MISSING:
                dedupe_key = text_of(value)
            if dedupe_key is not None and self.store.seen(trigger.id, dedupe_key, trigger.dedupe.days):
                return "deduped", None, f"deduped: seen within {trigger.dedupe.days} days"
        if trigger.rate_per_hour is not None:
            hour_ago = self.now() - timedelta(hours=1)
            if self.store.count_since(trigger.id, hour_ago, PASSED) >= trigger.rate_per_hour:
                over = self.store.count_since(trigger.id, hour_ago, ("rate_limited",)) + 1
                self._push_once(trigger, "rate", f"{trigger.name}: {over} events over the rate limit in the last hour")
                return "rate_limited", None, f"rate limit {trigger.rate_per_hour}/h"
        action = trigger.action
        if isinstance(action, DeliverAction):
            return self._deliver(trigger, action, payload)
        if isinstance(action, StartAction):
            return self._start(trigger, action, payload)
        assert isinstance(action, NotifyAction)
        reached = self.push(trigger.name, f"{trigger.name}: {framing.preview(payload)}")
        return "notified", None, f"pushed to {reached} device{'' if reached == 1 else 's'}"

    def _deliver(self, trigger: Trigger, action: DeliverAction, payload: Any) -> tuple[Outcome, str | None, str]:
        if self.tasks is None:
            return "failed", None, "no team tasks here"
        try:
            receiver = self.tasks.receiver(action.to, None)
            if receiver.session.archived_at is not None:
                raise NotFound(f"{action.to} is archived")
            _, receiver, _ = self.tasks.send(
                None, "", receiver.session.id, framing.data_block(trigger.name, payload),
                from_label=f"trigger {trigger.name}", wait=False,
            )  # fmt: skip
        except (NotFound, Conflict, Invalid) as exc:
            self._push_once(trigger, "gone", f"{trigger.name}: could not deliver to {action.to} ({exc})")
            return "failed", None, f"target gone: {exc}"
        return "delivered", receiver.session.id, f"queued for {receiver.session.name}"  # sent by the task loop

    def _start(self, trigger: Trigger, action: StartAction, payload: Any) -> tuple[Outcome, str | None, str]:
        if self.start is None:
            return "failed", None, "sessions cannot be started here"
        running = [t for t in self.store.targets(trigger.id, "started") if self.alive(t)]
        if len(running) >= MAX_STARTED:
            return "failed", None, f"{MAX_STARTED} started sessions still running"
        args = StartArgs(
            cwd=action.cwd, machine=action.machine, role=action.role, project=action.project,
            runtime=action.runtime, prompt=framing.instruction(trigger.name, action.message, payload),
            permission_mode=None,  # the launch's default: a trigger never asks for more
        )  # fmt: skip
        try:
            session_id = self.start(args, f"trigger {trigger.name}")
        except Exception as exc:  # noqa: BLE001 - logged as the firing's outcome, and here
            logger.warning("trigger %s could not start a session: %s", trigger.name, exc)
            return "failed", None, f"could not start: {exc}"
        return "started", session_id, f"started {session_id}"

    def _push_once(self, trigger: Trigger, kind: str, text: str) -> None:
        """At most one push of this kind about this trigger an hour."""
        now = self.now()
        with self._lock:
            last = self._pushed.get((trigger.id, kind))
            if last is not None and now - last < PUSH_GAP:
                return
            self._pushed[(trigger.id, kind)] = now
        try:
            self.push(trigger.name, text)
        except Exception:
            logger.exception("could not push about trigger %s", trigger.name)
