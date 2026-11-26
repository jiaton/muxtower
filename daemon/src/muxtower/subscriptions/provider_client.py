"""The providers' usage endpoints, over HTTPS. Only these three URLs are ever asked: no sign-in, no refresh.

A failure is an Unavailable that says which host and how, never the reply's body or the request's headers."""

from typing import Any

import httpx

from muxtower.errors import Unavailable
from muxtower.subscriptions.ports import Secret

CLAUDE_USAGE = "https://api.anthropic.com/api/oauth/usage"
CLAUDE_PROFILE = "https://api.anthropic.com/api/oauth/profile"
CODEX_USAGE = "https://chatgpt.com/backend-api/wham/usage"
TIMEOUT_SECONDS = 15.0


def redact(text: str, token: Secret) -> str:
    return text.replace(token.value, "***") if token.value else text


class ProviderClient:
    def __init__(self, transport: httpx.BaseTransport | None = None) -> None:
        self.transport = transport  # tests: a fake; never a real host there

    def claude_usage(self, token: Secret) -> Any:
        return self._get(CLAUDE_USAGE, token, {"anthropic-beta": "oauth-2025-04-20"})

    def claude_profile(self, token: Secret) -> Any:
        return self._get(CLAUDE_PROFILE, token, {"anthropic-beta": "oauth-2025-04-20"})

    def codex_usage(self, token: Secret, account_id: str) -> Any:
        return self._get(CODEX_USAGE, token, {"ChatGPT-Account-Id": account_id})

    def _get(self, url: str, token: Secret, headers: dict[str, str]) -> Any:
        host = httpx.URL(url).host
        try:
            with httpx.Client(transport=self.transport, timeout=TIMEOUT_SECONDS, follow_redirects=False) as client:
                response = client.get(url, headers={"Authorization": f"Bearer {token.value}", **headers})
        except httpx.HTTPError as exc:
            raise Unavailable(redact(f"{host}: {type(exc).__name__}: {exc}", token)) from None
        if response.status_code in (401, 403):
            raise Unavailable(f"{host} refused the sign-in ({response.status_code}); the CLI signs in again itself")
        if response.status_code != 200:
            raise Unavailable(f"{host} answered {response.status_code}")
        try:
            return response.json()
        except ValueError:
            raise Unavailable(f"{host} answered no JSON") from None
