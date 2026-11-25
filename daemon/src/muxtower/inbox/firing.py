"""The hub's own Inbox work, never an agent's: due dates acted on (`fire_due`), each exactly once (claimed
in the same transaction as what it does: a second tick or a restart finds it claimed), and the weekly nudge to
the concierge. Run by `schedule.py`, off the event loop."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from muxtower.errors import Conflict, NotFound
from muxtower.inbox import due
from muxtower.inbox.models import HandTarget, InboxStatus, OnDue
from muxtower.inbox.service import FROM, InboxService
from muxtower.inbox.store import Row
from muxtower.inbox.text import render

NUDGE_EVERY = timedelta(days=7)
NUDGED = "nudged_at"

# A push to the owner's devices: title, body, the item it is about.
Notify = Callable[[str, str, int], Any]


class InboxWork:
    def __init__(self, inbox: InboxService) -> None:
        self.inbox = inbox
        self.store = inbox.store
        self.settings = inbox.settings
        self.notify: Notify = lambda title, body, item_id: None  # the owner's devices: set by the app
        self.concierge: Callable[[], str | None] = lambda: None  # the concierge's session: set by the app

    def next_due(self) -> datetime | None:
        """When the next due date not acted on falls (None: none)."""
        s = self.settings()
        times = [t for r in self.store.unfired() if (t := due.instant(r.due_at, r.due_date, s.zone(), s.due_hour))]
        return min(times, default=None)

    def fire_due(self, now: datetime | None = None) -> int:
        """Blocking. Acts on every due date that has come and was not acted on: each exactly once. How many."""
        now = now or datetime.now(UTC)
        s = self.settings()
        fired = 0
        for row in self.store.unfired():
            when = due.instant(row.due_at, row.due_date, s.zone(), s.due_hour)
            if when is None or when > now:
                continue
            if row.on_due is OnDue.HAND_OFF and row.status is InboxStatus.OPEN and row.target_project:
                fired += self._fire_hand_off(row, now)
            elif self.store.claim(row.id, row.version, now):
                fired += 1
                self.inbox.audit.record("inbox", "inbox-due", None, f"item {row.id} remind")
                self.notify(f"Due: {row.text}"[:80], row.text[:300], row.id)
        if fired:
            self.inbox.changed()
        return fired

    def _fire_hand_off(self, row: Row, now: datetime) -> int:
        target = HandTarget(project=row.target_project or "", role=row.target_role, session_id=row.target_session)
        try:
            with self.inbox.db.transaction():
                if not self.store.claim(row.id, row.version, now):
                    return 0
                written = self.inbox.handed_now(self.store.get(row.id), target, "inbox")
        except (Conflict, NotFound) as exc:  # it no longer resolves: the owner is told, the item stays open
            if not self.store.claim(row.id, row.version, now):
                return 0
            self.inbox.audit.record("inbox", "inbox-due", None, f"item {row.id} not handed")
            self.notify(f"Due, not handed: {row.text}"[:80], f"{exc}. It stays open in your Inbox.", row.id)
            return 1
        name = (s.name if (s := self.inbox.directory.find(written.handed_session or "")) else None) or "its session"
        self.notify(f"Handed: {row.text}"[:80], f"Due today: sent to {name} in {target.project}.", row.id)
        return 1

    def nudge(self, now: datetime | None = None) -> bool:
        """Blocking. At most once a week, when `inbox.cleanup` is on: one task to the concierge listing the
        items nobody touched for `inbox.stale_days`, only when there are any. Whether it sent one."""
        s, now = self.settings(), now or datetime.now(UTC)
        concierge = self.concierge()
        if not s.cleanup or concierge is None:
            return False
        last = self.store.fact(NUDGED)
        if last and now - datetime.fromisoformat(last) < NUDGE_EVERY:
            return False
        stale = self.store.untouched(now - timedelta(days=s.stale_days))
        if not stale:
            return False
        text = (
            f"These Inbox items were not touched for {s.stale_days} days or more: ask the owner about them "
            "(keep, hand off or close each), then update them (update_inbox_item, close_inbox_item).\n"
            + render([self.inbox.item(r, now) for r in stale])
        )
        self.inbox.tasks.send(None, "inbox", concierge, text, from_label=FROM, wait=False)
        self.store.set_fact(NUDGED, now.isoformat())
        self.inbox.audit.record("inbox", "inbox-nudge", concierge, f"{len(stale)} items")
        return True
