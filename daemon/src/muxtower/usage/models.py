from datetime import datetime

from pydantic import BaseModel, Field


class ProcessUsage(BaseModel):
    pid: int
    name: str
    cpu_percent: float | None = Field(default=None, description="of one core, over the last minute; null: unknown")
    rss_mb: float | None = None


class SlowRule(BaseModel):
    """The screen rule that took longest in the latest ticks."""

    session_id: str
    session_name: str | None = None
    rule: str
    ms: float


class TickUsage(BaseModel):
    """The capture loop: each tick reads and classifies every pane."""

    avg_ms: float | None = Field(default=None, description="over the last minute; null: no tick yet")
    max_ms: float | None = None
    slowest: SlowRule | None = None


class UsageAlert(BaseModel):
    metric: str = Field(description="cpu | tick | memory")
    value: float
    threshold: float
    detail: str | None = None


class MachineUsage(BaseModel):
    """What the daemon on one machine uses, sampled every few seconds. A value it cannot read there is null
    (unknown), never 0."""

    machine: str
    sampled_at: datetime
    stale: bool = Field(default=False, description="a node's last report is old: it may be gone")
    cpu_1m: float | None = Field(default=None, description="percent of one core, average over the last minute")
    cpu_10m: float | None = None
    rss_mb: float | None = None
    peak_rss_mb: float | None = None
    threads: int | None = None
    open_files: int | None = None
    children: list[ProcessUsage] | None = Field(default=None, description="null: cannot be read on this system")
    tick: TickUsage = Field(default_factory=TickUsage)
    alerts: list[UsageAlert] = Field(default_factory=list)
