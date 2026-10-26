"""Device tokens: minted once, shown once, stored only as a sha256 hash."""

import hashlib
import secrets
from datetime import UTC, datetime

from muxtower.auth.ports import DeviceToken, TokenRepository

TOUCH_EVERY_SECONDS = 60


class TokenNameTaken(Exception):
    pass


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class TokenService:
    def __init__(self, repo: TokenRepository, extra: dict[str, str] | None = None) -> None:
        self.repo = repo
        # Tokens that live outside the table: the CLI's local token and the optional shared token.
        self.extra = {name: token for name, token in (extra or {}).items() if token}

    def create(self, name: str) -> tuple[DeviceToken, str]:
        if name in self.extra or any(t.name == name for t in self.repo.list()):
            raise TokenNameTaken(name)
        token = "mxt_" + secrets.token_urlsafe(32)
        return self.repo.add(name, hash_token(token), datetime.now(UTC)), token

    def list(self) -> list[DeviceToken]:
        return self.repo.list()

    def unique_name(self, wanted: str) -> str:
        taken = {t.name for t in self.repo.list()} | set(self.extra)
        name, n = wanted, 2
        while name in taken:
            name, n = f"{wanted}-{n}", n + 1
        return name

    def exists(self, name: str) -> bool:
        return name in self.extra or any(t.name == name for t in self.repo.list())

    def revoke(self, name: str) -> bool:
        return self.repo.remove(name)

    def verify(self, presented: str) -> DeviceToken | None:
        if not presented:
            return None
        for name, token in self.extra.items():
            if secrets.compare_digest(presented, token):
                return DeviceToken(id=0, name=name, created_at=datetime.now(UTC), last_used_at=None)
        # Lookup is by hash, so comparing against stored values never touches the plaintext.
        found = self.repo.find_by_hash(hash_token(presented))
        if found is not None:
            now = datetime.now(UTC)
            # Recording every request would mean a disk write per API call; once a minute is plenty.
            if found.last_used_at is None or (now - found.last_used_at).total_seconds() > TOUCH_EVERY_SECONDS:
                self.repo.touch(found.id, now)
        return found
