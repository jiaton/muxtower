"""The hub's book of plans: each machine's newest reports, as accounts with the machines using them.

A machine's report replaces what it said before (an account it no longer reads is no longer its). An account
shows its newest report, limited while any machine says it is. When an account becomes limited the owner's
devices get one push (`announce`), not again while that limit lasts, however many machines say it; nothing
is pushed before (the app shows a window near its limit itself)."""

import asyncio
import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, tzinfo
from typing import Any

from pydantic import ValidationError

from muxtower.subscriptions.models import PlanAccount, PlanMachine, PlanReport, PlanReports, Provider

logger = logging.getLogger("muxtower.plan_usage")

NAMES = {Provider.CLAUDE: "Claude", Provider.CODEX: "Codex"}


@dataclass(frozen=True)
class Limit:
    provider: Provider
    account: str
    until: datetime
    plan: str | None
    machines: tuple[str, ...]


class PlanBook:
    def __init__(
        self, push: Callable[[str, str], object] | None = None, zone: Callable[[], tzinfo | None] = lambda: None,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:  # fmt: skip
        self.push = push  # (title, body) to every device
        self.zone = zone  # the owner's time zone, for the push's "until 14:00"; None: this machine's
        self.clock = clock
        self._lock = threading.Lock()
        self._by_machine: dict[str, dict[tuple[Provider, str], PlanReport]] = {}
        self._pushed: dict[tuple[Provider, str], datetime] = {}  # the limit each account was last pushed for

    def take(self, machine: str, reports: list[PlanReport]) -> list[Limit]:
        """A machine's reports, whole; returns the limits newly reached (each to `announce` once)."""
        with self._lock:
            self._by_machine[machine] = {(r.provider, r.account): r for r in reports}
            if not reports:
                del self._by_machine[machine]
            return self._due()

    def heard(self, machine: str, data: Any) -> None:
        """A node's `plan_usage` event, on the event loop: kept, and a push sent beside it when one is due."""
        try:
            reports = PlanReports.model_validate(data).reports
        except ValidationError:
            logger.info("plan usage: %s sent a report this hub cannot read", machine)
            return
        if due := self.take(machine, reports):
            asyncio.get_running_loop().run_in_executor(None, self.announce, due)

    def forget(self, machine: str) -> None:
        with self._lock:
            self._by_machine.pop(machine, None)

    def clear(self) -> None:
        with self._lock:
            self._by_machine.clear()

    def accounts(self) -> list[PlanAccount]:
        with self._lock:
            return _accounts(self._by_machine, self.clock())

    def _due(self) -> list[Limit]:
        """Under the lock: accounts limited now that were not already pushed for this limit."""
        now = self.clock()
        due = []
        for account in _accounts(self._by_machine, now):
            key, until = (account.provider, account.account), account.limited_until
            if until is None:
                continue
            pushed = self._pushed.get(key)
            if pushed is None or pushed <= now:  # none yet, or the last limit has passed: a new one
                machines = tuple(m.machine for m in account.machines)
                due.append(Limit(account.provider, account.account, until, account.plan, machines))
                self._pushed[key] = until
            else:
                self._pushed[key] = max(until, pushed)  # the same limit, said again or longer
        return due

    def announce(self, due: list[Limit]) -> None:
        """Blocking: one push for each limit newly reached."""
        if self.push is None:
            return
        for limit in due:
            title, body = self.text(limit)
            try:
                self.push(title, body)
            except Exception:
                logger.exception("plan usage: the push for %s failed", limit.provider)

    def text(self, limit: Limit) -> tuple[str, str]:
        zone = self.zone()
        until, now = limit.until.astimezone(zone), self.clock().astimezone(zone)
        at = until.strftime("%H:%M") if until.date() == now.date() else until.strftime("%a %H:%M")
        plan = f"{limit.plan.capitalize()} plan" if limit.plan else "The plan"
        where = f", used on {', '.join(limit.machines)}" if limit.machines else ""
        return f"{NAMES[limit.provider]} limited until {at}", f"{plan}{where}: requests are refused until then."


def _accounts(by_machine: dict[str, dict[tuple[Provider, str], PlanReport]], now: datetime) -> list[PlanAccount]:
    grouped: dict[tuple[Provider, str], list[tuple[str, PlanReport]]] = {}
    for machine, reports in by_machine.items():
        for key, report in reports.items():
            grouped.setdefault(key, []).append((machine, report))
    accounts = []
    for (provider, account), seen in sorted(grouped.items()):
        newest = max((r for _, r in seen), key=lambda r: r.observed_at)
        limits = [r.limited_until for _, r in seen if r.limited_until is not None and r.limited_until > now]
        machines = sorted(seen, key=lambda s: s[1].observed_at, reverse=True)
        accounts.append(PlanAccount(
            provider=provider, account=account, plan=newest.plan, windows=newest.windows,
            limited_until=max(limits, default=None), observed_at=newest.observed_at,
            machines=[PlanMachine(machine=m, reported_at=r.observed_at) for m, r in machines],
        ))  # fmt: skip
    return accounts
