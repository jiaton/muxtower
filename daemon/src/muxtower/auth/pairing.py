"""One-time pairing codes. A code is shown (QR or text) to a new device, which redeems it once for its
own device token. Codes are stored hashed, expire quickly, and claims are rate limited per client."""

import hashlib
import secrets
import time
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta

from muxtower.auth.models import ClaimResult, PairCode
from muxtower.auth.service import TokenService
from muxtower.config import PairingMode, PairingSettings
from muxtower.errors import Forbidden, Invalid
from muxtower.infra.db import Database

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I
CLAIMS_PER_MINUTE = 10


def normalize(code: str) -> str:
    return "".join(c for c in code.upper() if c in ALPHABET)


def _hash(code: str) -> str:
    return hashlib.sha256(normalize(code).encode()).hexdigest()


class PairingService:
    def __init__(self, db: Database, tokens: TokenService, settings: PairingSettings, daemon_name: str) -> None:
        self.db = db
        self.tokens = tokens
        self.settings = settings
        self.daemon_name = daemon_name
        self._attempts: dict[str, deque[float]] = defaultdict(deque)

    def create_code(self, created_by: str) -> PairCode:
        raw = "".join(secrets.choice(ALPHABET) for _ in range(8))
        expires = datetime.now(UTC) + timedelta(seconds=self.settings.code_ttl_seconds)
        with self.db.connect() as conn:
            conn.execute("DELETE FROM pair_codes WHERE expires_at < ?", (datetime.now(UTC).isoformat(),))
            conn.execute(
                "INSERT INTO pair_codes (code_hash, created_by, expires_at) VALUES (?, ?, ?)",
                (_hash(raw), created_by, expires.isoformat()),
            )
        return PairCode(code=f"{raw[:4]}-{raw[4:]}", expires_at=expires)

    def _rate_limit(self, client: str) -> None:
        window = self._attempts[client]
        now = time.monotonic()
        while window and now - window[0] > 60:
            window.popleft()
        if len(window) >= CLAIMS_PER_MINUTE:
            raise Forbidden("too many pairing attempts; wait a minute")
        window.append(now)

    def claim(self, code: str, device_name: str, client: str) -> ClaimResult:
        self._rate_limit(client)
        now = datetime.now(UTC).isoformat()
        with self.db.connect() as conn:
            # Single statement: two devices racing for one code cannot both win.
            used = conn.execute(
                """UPDATE pair_codes SET used_at = ?
                   WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?""",
                (now, _hash(code), now),
            ).rowcount
        if not used:
            raise Invalid("pairing code is wrong, used, or expired")

        if self.settings.mode == PairingMode.SHARED:
            if not self.settings.shared_token:
                raise Invalid("pairing.mode is 'shared' but pairing.shared_token is not set")
            return ClaimResult(token=self.settings.shared_token, device_name="shared", daemon_name=self.daemon_name)
        device, token = self.tokens.create(self.tokens.unique_name(device_name.strip()))
        return ClaimResult(token=token, device_name=device.name, daemon_name=self.daemon_name)
