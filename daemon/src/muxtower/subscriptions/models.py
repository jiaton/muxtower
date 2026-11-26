"""The Claude and Codex plans this owner's machines are signed into, and how much of each is used.

Each daemon reads the plans its own machine's CLIs are signed into (every five minutes, while the hub's setting
`plan_usage.enabled` is on) and a node tells its hub (`PlanReports`, the `plan_usage` event). The hub keeps the
newest report of each account and which machines use it (`PlanUsage`, `GET /v1/plan-usage`). Nothing from the
credential files goes further than this process: an account is a hash, never a name, address or token."""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class Provider(StrEnum):
    CLAUDE = "claude"
    CODEX = "codex"


class WindowKind(StrEnum):
    SESSION = "session"  # the 5-hour window
    WEEKLY = "weekly"  # the week, every model
    WEEKLY_SCOPED = "weekly_scoped"  # the week, one model (`model`)
    OTHER = "other"  # a window of another length (`seconds`)


class UsageWindow(BaseModel):
    id: str = Field(description="stable within its account: session, weekly, weekly:<model>, or <seconds>s")
    kind: WindowKind
    label: str = Field(description='in full, e.g. "5-hour session", "Week, all models", "Week, Opus"')
    model: str | None = Field(default=None, description="weekly_scoped: the model it counts")
    seconds: int | None = Field(default=None, description="its length, when the provider says it")
    percent: float | None = Field(default=None, description="used, 0 to 100; null: the reply had no such figure")
    resets_at: datetime | None = Field(default=None, description="null: not said")


class PlanReport(BaseModel):
    """One account as one machine read it."""

    provider: Provider
    account: str = Field(description="the account's key: a hash of the provider's own id for it")
    plan: str | None = Field(default=None, description="e.g. max, pro, plus; null: not said")
    windows: list[UsageWindow] = Field(default_factory=list)
    limited_until: datetime | None = Field(
        default=None, description="the provider refuses this account's requests until then (rate-limited)"
    )
    observed_at: datetime = Field(description="when it was read from the provider")


class PlanReports(BaseModel):
    """What a node tells its hub (event `plan_usage`): every account it reads, whole, each time."""

    reports: list[PlanReport] = Field(default_factory=list)


class PlanUsageSetting(BaseModel):
    """What the hub tells each node (event `plan_usage`): whether any machine reads plans."""

    enabled: bool


class PlanMachine(BaseModel):
    machine: str = Field(description="a machine signed into the account: this daemon's name or a node's")
    reported_at: datetime = Field(description="when that machine last read the account")


class PlanAccount(BaseModel):
    """An account, as the newest report of it says, and every machine using it."""

    provider: Provider
    account: str = Field(description="the account's key (a hash): show a short form of it, if any")
    plan: str | None = None
    windows: list[UsageWindow] = Field(default_factory=list)
    limited_until: datetime | None = None
    observed_at: datetime = Field(description="when the newest report was read: an old one is said with its age")
    machines: list[PlanMachine] = Field(default_factory=list)


class PlanUsage(BaseModel):
    enabled: bool = Field(description="off (the setting plan_usage.enabled): no machine reads its plans")
    accounts: list[PlanAccount] = Field(default_factory=list)
