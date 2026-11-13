from typing import Literal

from pydantic import BaseModel, Field

from muxtower.runtimes.models import ATTENTION_STATES, AgentState


class VapidKey(BaseModel):
    public_key: str


class SubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class Subscribe(BaseModel):
    endpoint: str = Field(pattern=r"^https://")
    keys: SubscriptionKeys
    client_ref: str = Field(max_length=100, description="opaque; echoed in every push (the app's daemon id)")
    states: list[AgentState] = Field(default_factory=lambda: sorted(ATTENTION_STATES))
    done: bool = Field(default=True, description="also notify when a session finishes a turn")
    muted: list[str] = Field(default_factory=list, description="session ids that never notify")


class Subscription(BaseModel):
    id: str
    client_ref: str
    states: list[AgentState]
    done: bool = True
    muted: list[str]


class PushPayload(BaseModel):
    client_ref: str
    daemon_name: str
    session_id: str | None = Field(default=None, description="none for news of the daemon itself")
    session_name: str | None = None
    state: AgentState | None = None
    kind: Literal["attention", "done", "login", "recovery", "clear"] = Field(
        description="a session needs the owner, or finished a turn; the daemon's Claude login expired; a "
        "restart interrupted sessions there; clear: only `settled` (the device shows other notifications)"
    )
    title: str
    body: str
    settled: list[str] = Field(
        default_factory=list,
        description="sessions notified about before, seen or answered since: their notifications can go",
    )
