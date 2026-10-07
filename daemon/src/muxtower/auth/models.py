from datetime import datetime

from pydantic import BaseModel, Field


class Device(BaseModel):
    name: str
    created_at: datetime
    last_used_at: datetime | None
    current: bool = Field(description="the device making this request")


class PairCode(BaseModel):
    code: str = Field(description="one-time code, e.g. K7QM-3XPA")
    expires_at: datetime


class ClaimRequest(BaseModel):
    code: str = Field(min_length=4, max_length=32)
    device_name: str = Field(min_length=1, max_length=60)


class ClaimResult(BaseModel):
    token: str
    device_name: str
    daemon_name: str
