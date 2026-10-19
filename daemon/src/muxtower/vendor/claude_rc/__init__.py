"""Vendored subset of claude-rc-api (MIT, see LICENSE and VENDORED.md): the Remote Control client,
credentials and event helpers. The CLI and web UI are left out."""

from .client import APIError, ControlRejected, ControlTimeout, RemoteControlClient
from .credentials import CredentialsError, OAuthCredentials, load_credentials, load_org_uuid
from .events import RC, RCSystem, Event

__all__ = [
    "APIError", "ControlRejected", "ControlTimeout", "CredentialsError", "Event", "OAuthCredentials",
    "RC", "RCSystem", "RemoteControlClient", "load_credentials", "load_org_uuid",
]
