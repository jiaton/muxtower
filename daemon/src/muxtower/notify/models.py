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
    session_id: str
    session_name: str
    state: AgentState
    kind: Literal["attention", "done"] = Field(description="needs the owner, or finished a turn")
    title: str
    body: str
