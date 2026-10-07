"""Signed cookie that authenticates only the /v1/stream WebSocket of a same-origin app (the bundled UI).
REST routes never read it, so it cannot be used for cross-site request forgery."""

import base64
import hashlib
import hmac
import secrets
import time
from pathlib import Path

COOKIE_NAME = "muxtower_stream"
COOKIE_PATH = "/v1/stream"
MAX_AGE_SECONDS = 30 * 24 * 3600


class StreamCookieSigner:
    def __init__(self, state_dir: Path) -> None:
        path = state_dir / "cookie_secret"
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(secrets.token_hex(32))
            path.chmod(0o600)
        self.secret = path.read_text().strip().encode()

    def _sig(self, payload: str) -> str:
        return hmac.new(self.secret, payload.encode(), hashlib.sha256).hexdigest()

    def issue(self, device_name: str) -> str:
        name = base64.urlsafe_b64encode(device_name.encode()).decode().rstrip("=")
        payload = f"{name}.{int(time.time()) + MAX_AGE_SECONDS}"
        return f"{payload}.{self._sig(payload)}"

    def verify(self, value: str) -> str | None:
        """Device name the cookie was issued to, if the signature holds and it has not expired."""
        try:
            name, expires, sig = value.split(".")
        except ValueError:
            return None
        if not hmac.compare_digest(sig, self._sig(f"{name}.{expires}")) or int(expires) < time.time():
            return None
        return base64.urlsafe_b64decode(name + "=" * (-len(name) % 4)).decode()
