"""Triggers: an outside event (a webhook, the owner's own script through `muxtower trigger`) that reaches an
agent as data: delivered to a session as a task, a new session started for it, or a push. Kept on the hub.

v1's one source is the fire endpoint (webhook and CLI both); email, schedules, RSS and MQTT come later as
more `Source` kinds feeding the same pipeline (filter → dedupe → rate → action)."""

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

NAME = r"^[a-z0-9][a-z0-9_-]{0,47}$"
SECRET_HEADER = "X-Muxtower-Trigger-Secret"  # noqa: S105 - a header name
MAX_BODY = 64 * 1024  # what a firing may carry
MAX_CONDITIONS = 8

Outcome = Literal["delivered", "started", "notified", "filtered", "deduped", "rate_limited", "paused", "failed"]
Via = Literal["webhook", "cli", "test"]


class Source(BaseModel):
    """Where its events come from. v1: its own fire endpoint (a webhook, or `muxtower trigger`)."""

    kind: Literal["webhook"] = "webhook"


class Condition(BaseModel):
    """One test of the event's payload (JSON); a trigger's conditions all hold, or it is filtered out."""

    field: str = Field(min_length=1, max_length=200, description='a dotted path into the payload: "deal.price"')
    op: Literal["equals", "contains", "regex"]
    value: str = Field(max_length=500)


class Dedupe(BaseModel):
    """An event whose key was seen within `days` is dropped. The key: the payload's `field`, else the
    firing's own (`?key=`, `--key`)."""

    field: str | None = Field(default=None, max_length=200)
    days: int = Field(default=7, ge=1, le=365)


class DeliverAction(BaseModel):
    """To a session that keeps its context across events: as a team task, queued while it works."""

    kind: Literal["deliver"] = "deliver"
    to: str = Field(min_length=1, max_length=200, description='a session id, or "role@project"')


class StartAction(BaseModel):
    """A new session per event (at most 3 of a trigger's alive at once), in `triggers.start_mode` for its runtime,
    never above a launch's default unless agents may escalate (`triggers/modes.py`). `message` is the owner's
    text; {payload} and {a.b} in it are filled in as data, inside the external-data block, never spliced into
    the instructions."""

    kind: Literal["start"] = "start"
    machine: str | None = None
    cwd: str | None = None
    role: str | None = Field(default=None, max_length=200)
    project: str | None = Field(default=None, max_length=200)
    runtime: str = "claude-code"
    message: str = Field(min_length=1, max_length=4000)


class NotifyAction(BaseModel):
    """A push to the owner's devices."""

    kind: Literal["notify"] = "notify"


Action = Annotated[DeliverAction | StartAction | NotifyAction, Field(discriminator="kind")]


class TriggerSpec(BaseModel):
    name: str = Field(pattern=NAME, description="lowercase letters, digits, - and _: what `muxtower trigger` takes")
    enabled: bool = Field(default=True, description="paused: its firings are still taken and logged, as paused")
    source: Source = Field(default_factory=Source)
    filter: list[Condition] = Field(default_factory=list, max_length=MAX_CONDITIONS)
    dedupe: Dedupe | None = None
    rate_per_hour: int | None = Field(default=None, ge=1, le=10_000, description="more in an hour: rate_limited")
    action: Action


class TriggerPatch(BaseModel):
    name: str | None = Field(default=None, pattern=NAME)
    enabled: bool | None = None
    filter: list[Condition] | None = Field(default=None, max_length=MAX_CONDITIONS)
    dedupe: Dedupe | None = None
    clear_dedupe: bool = False
    rate_per_hour: int | None = Field(default=None, ge=1, le=10_000)
    clear_rate: bool = False
    action: Action | None = None


class Trigger(TriggerSpec):
    id: str
    created_at: datetime
    updated_at: datetime
    last_fired_at: datetime | None = None
    last_outcome: Outcome | None = None


class TriggerCreated(BaseModel):
    trigger: Trigger
    secret: str = Field(description=f"shown once: sent as the {SECRET_HEADER} header (or /fire/<secret>)")


class TriggerSecret(BaseModel):
    secret: str = Field(description="the new one, shown once; the old one no longer fires it")


class Firing(BaseModel):
    id: int
    trigger_id: str
    at: datetime
    via: Via
    key: str | None = None
    outcome: Outcome
    target: str | None = Field(default=None, description="the session it went to, or was started")
    detail: str | None = None
    bytes: int


class TestFire(BaseModel):
    payload: Any = None
    key: str | None = Field(default=None, max_length=200)


class FireByName(BaseModel):
    """`muxtower trigger <name>`: the owner's own script, on this machine (a node passes it to its hub)."""

    name: str = Field(pattern=NAME)
    payload: Any = None
    key: str | None = Field(default=None, max_length=200)
