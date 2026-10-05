"""Device tokens: minted once, shown once, stored only as a sha256 hash."""

import hashlib
import secrets
from datetime import UTC, datetime

from muxtower.auth.ports import DeviceToken, TokenRepository


class TokenNameTaken(Exception):
    pass


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class TokenService:
    def __init__(self, repo: TokenRepository) -> None:
        self.repo = repo

    def create(self, name: str) -> tuple[DeviceToken, str]:
        if any(t.name == name for t in self.repo.list()):
            raise TokenNameTaken(name)
        token = "mxt_" + secrets.token_urlsafe(32)
        return self.repo.add(name, hash_token(token), datetime.now(UTC)), token

    def list(self) -> list[DeviceToken]:
        return self.repo.list()

    def revoke(self, name: str) -> bool:
        return self.repo.remove(name)

    def verify(self, presented: str) -> DeviceToken | None:
        if not presented:
            return None
        # Lookup is by hash, so comparing against stored values never touches the plaintext.
        found = self.repo.find_by_hash(hash_token(presented))
        if found is not None:
            self.repo.touch(found.id, datetime.now(UTC))
        return found
