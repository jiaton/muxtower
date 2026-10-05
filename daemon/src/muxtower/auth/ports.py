from datetime import datetime
from typing import Protocol

from pydantic import BaseModel


class DeviceToken(BaseModel):
    id: int
    name: str
    created_at: datetime
    last_used_at: datetime | None


class TokenRepository(Protocol):
    def add(self, name: str, token_hash: str, created_at: datetime) -> DeviceToken: ...
    def list(self) -> list[DeviceToken]: ...
    def find_by_hash(self, token_hash: str) -> DeviceToken | None: ...
    def touch(self, token_id: int, at: datetime) -> None: ...
    def remove(self, name: str) -> bool: ...
