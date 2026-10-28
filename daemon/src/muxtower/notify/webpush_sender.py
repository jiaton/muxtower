"""Web Push via pywebpush with a VAPID key pair kept in the state directory."""

import base64
import logging
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from pywebpush import WebPushException, webpush

from muxtower.notify.ports import StoredSubscription

logger = logging.getLogger("muxtower.push")
FALLBACK_SUBJECT = "mailto:muxtower@localhost"


def subject(contact: str | None, public_url: str | None) -> str:
    """The VAPID `sub`: the configured contact, else this daemon's public HTTPS address. Push services may
    check it: Apple's refuses a placeholder (403 BadJwtToken), so iPhones get nothing without one."""
    if contact:
        return contact
    if public_url and public_url.startswith("https://"):
        return public_url.rstrip("/")
    logger.warning("no push_contact or https public_url: pushes to iPhones and iPads will be refused")
    return FALLBACK_SUBJECT


class WebPushSender:
    def __init__(self, state_dir: Path, subject: str = FALLBACK_SUBJECT) -> None:
        self.key_path = state_dir / "vapid_private.pem"
        self.subject = subject
        self._ensure_key()

    def _ensure_key(self) -> None:
        if self.key_path.exists():
            return
        key = ec.generate_private_key(ec.SECP256R1())
        pem = key.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
        )
        self.key_path.parent.mkdir(parents=True, exist_ok=True)
        self.key_path.write_bytes(pem)
        self.key_path.chmod(0o600)

    @property
    def public_key(self) -> str:
        key = serialization.load_pem_private_key(self.key_path.read_bytes(), password=None)
        assert isinstance(key, ec.EllipticCurvePrivateKey)
        raw = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    def send(self, sub: StoredSubscription, payload: str) -> bool:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=str(self.key_path),
                vapid_claims={"sub": self.subject},
                ttl=3600,
            )
        except WebPushException as exc:
            status = exc.response.status_code if exc.response is not None else None
            if status in (404, 410):
                return False
            logger.warning("push to subscription %s failed: %s", sub.id, status or exc)
        return True
