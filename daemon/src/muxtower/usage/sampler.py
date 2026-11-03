"""What the daemon uses, sampled every few seconds (cheap: /proc or the standard library, `readers.py`) and
kept, so asking costs nothing: CPU over the last minute and ten (not since it started, which flattens a
spike), memory, threads, open files, its children, and the capture loop's ticks with the screen rule that
took longest. Over a threshold (`UsageSettings`) is an alert, which the app shows by the machine's name."""

import asyncio
import logging
import time
from collections import deque
from collections.abc import Callable, Iterable
from datetime import UTC, datetime

from muxtower.config import UsageSettings
from muxtower.sessions.monitor import TickTiming
from muxtower.usage import readers
from muxtower.usage.models import MachineUsage, ProcessUsage, SlowRule, TickUsage, UsageAlert

logger = logging.getLogger("muxtower.usage")

SAMPLE_SECONDS = 5.0
WINDOWS = {"1m": 60.0, "10m": 600.0}
TICK_WINDOW = 60.0


def average(samples: Iterable[tuple[float, float]], now: float, window: float) -> float | None:
    """Percent of one core over the window, from (time, CPU seconds) samples; None while they span less than
    half of it (just started)."""
    inside = [s for s in samples if now - s[0] <= window]
    if len(inside) < 2 or inside[-1][0] - inside[0][0] < window / 2:
        return None
    (t0, c0), (t1, c1) = inside[0], inside[-1]
    return max(c1 - c0, 0.0) / (t1 - t0) * 100


def alerts(usage: MachineUsage, limits: UsageSettings) -> list[UsageAlert]:
    found: list[UsageAlert] = []
    if usage.cpu_1m is not None and usage.cpu_1m > limits.cpu_percent:
        found.append(UsageAlert(metric="cpu", value=round(usage.cpu_1m, 1), threshold=limits.cpu_percent))
    if usage.tick.avg_ms is not None and usage.tick.avg_ms > limits.tick_ms:
        slow = usage.tick.slowest
        detail = (
            f"slowest: rule {slow.rule} on {slow.session_name or slow.session_id}, {slow.ms:.0f} ms" if slow else None
        )
        found.append(UsageAlert(metric="tick", value=round(usage.tick.avg_ms), threshold=limits.tick_ms, detail=detail))
    if usage.rss_mb is not None and usage.rss_mb > limits.rss_mb:
        found.append(UsageAlert(metric="memory", value=round(usage.rss_mb), threshold=limits.rss_mb))
    return found


class UsageSampler:
    def __init__(
        self, machine: str, limits: UsageSettings, ticks: Callable[[], Iterable[TickTiming]],
        session_name: Callable[[str], str | None] = lambda _: None, clock: Callable[[], float] = time.monotonic,
    ) -> None:  # fmt: skip
        self.machine = machine
        self.limits = limits
        self.ticks = ticks
        self.session_name = session_name
        self.clock = clock
        self._cpu: deque[tuple[float, float]] = deque(maxlen=int(WINDOWS["10m"] / SAMPLE_SECONDS) + 2)
        self._children: dict[int, deque[tuple[float, float]]] = {}
        self.current = MachineUsage(machine=machine, sampled_at=datetime.now(UTC))

    def _tick(self, now: float) -> TickUsage:
        recent = [t for t in self.ticks() if now - t.at <= TICK_WINDOW]
        if not recent:
            return TickUsage()
        worst = max((t.slowest for t in recent if t.slowest), key=lambda s: s[2], default=None)
        slow = None
        if worst is not None:
            session_id, rule, seconds_taken = worst
            name = self.session_name(session_id)
            slow = SlowRule(session_id=session_id, session_name=name, rule=rule, ms=round(seconds_taken * 1000, 2))
        seconds = [t.seconds for t in recent]
        return TickUsage(
            avg_ms=round(sum(seconds) / len(seconds) * 1000, 1), max_ms=round(max(seconds) * 1000, 1), slowest=slow
        )

    def _kids(self, now: float) -> list[ProcessUsage] | None:
        found = readers.children()
        if found is None:
            return None
        seen = {pid for pid, _, _ in found}
        for pid in list(self._children):
            if pid not in seen:
                del self._children[pid]
        usage = []
        for pid, name, cpu in found:
            history = self._children.setdefault(pid, deque(maxlen=int(WINDOWS["1m"] / SAMPLE_SECONDS) + 2))
            history.append((now, cpu))
            usage.append(
                ProcessUsage(
                    pid=pid,
                    name=name,
                    cpu_percent=_round(average(history, now, WINDOWS["1m"])),
                    rss_mb=_round(readers.rss_mb(pid)),
                )
            )
        return usage

    def sample(self) -> MachineUsage:
        """Blocking (reads /proc). Takes a sample and keeps what it makes of the latest ones."""
        now = self.clock()
        self._cpu.append((now, readers.cpu_seconds()))
        usage = MachineUsage(
            machine=self.machine, sampled_at=datetime.now(UTC),
            cpu_1m=_round(average(self._cpu, now, WINDOWS["1m"])),
            cpu_10m=_round(average(self._cpu, now, WINDOWS["10m"])),
            rss_mb=_round(readers.rss_mb()), peak_rss_mb=_round(readers.peak_rss_mb()), threads=readers.threads(),
            open_files=readers.open_files(), children=self._kids(now), tick=self._tick(now),
        )  # fmt: skip
        usage.alerts = alerts(usage, self.limits)
        self.current = usage
        return usage

    async def run_loop(self) -> None:
        while True:
            try:
                await asyncio.to_thread(self.sample)
            except Exception:
                logger.exception("could not sample usage")
            await asyncio.sleep(SAMPLE_SECONDS)


def _round(value: float | None) -> float | None:
    return round(value, 1) if value is not None else None
