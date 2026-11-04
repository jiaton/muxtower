"""API schemas for hubs and nodes (what clients see)."""

from datetime import datetime

from pydantic import BaseModel, Field

from muxtower.runtimes.models import RuntimeInfo

NODE_NAME = r"^[a-z0-9][a-z0-9-]{0,39}$"


class NodeInfo(BaseModel):
    """A daemon joined to this one: its sessions are listed here, as from any other source."""

    name: str
    online: bool
    version: str | None = None
    update: str | None = Field(default=None, description="this daemon's version, when the node runs an older one")
    joined_at: datetime
    last_seen: datetime | None = Field(default=None, description="when it was last connected")
    sessions: int = Field(description="sessions it lists")
    runtimes: list[RuntimeInfo] = Field(default_factory=list, description="what can be started there")
    reported_url: str | None = Field(default=None, description="where it says the app can reach it itself")
    direct_url: str | None = Field(default=None, description="the owner's address for it, used over the reported one")


class NodeClaim(BaseModel):
    code: str = Field(min_length=4, max_length=32, description="a pairing code made on the hub")
    name: str = Field(min_length=1, max_length=60, description="what the node calls itself; the hub may change it")


class NodeClaimResult(BaseModel):
    token: str = Field(description="the node's own token, for the link only")
    name: str = Field(description="the name the hub gave it")
    hub_name: str


class JoinHub(BaseModel):
    url: str = Field(pattern=r"^https?://", max_length=500, description="the hub's address")
    code: str = Field(min_length=4, max_length=32, description="a pairing code made on the hub")


class HubStatus(BaseModel):
    """This daemon as a node of a hub, if it joined one."""

    url: str | None = Field(default=None, description="the hub it joined; null when it joined none")
    name: str | None = Field(default=None, description="its name on the hub")
    connected: bool = False
    error: str | None = Field(default=None, description="why it is not connected, when it tried")
    hub_version: str | None = Field(default=None, description="the muxtower version the hub runs, as it said")
    update: str | None = Field(default=None, description="the hub's version, when it is later than this one")
