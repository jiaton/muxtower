"""Fakes for plan usage (`subscriptions/`): sign-ins and provider replies made up here, never a real host."""

import base64
import json
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from muxtower.subscriptions.ports import ClaudeLogin, CodexLogin, Secret

CLAUDE_TOKEN = "sk-ant-oat01-MADEUPclaudeTOKEN0123456789"
CODEX_ACCOUNT = "acct-made-up-0001"
ORG = "00000000-0000-4000-8000-000000000001"


def codex_jwt(expires: datetime, plan: str = "plus") -> str:
    def part(data: dict[str, Any]) -> str:
        return base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip("=")

    claims = {"exp": int(expires.timestamp()), "https://api.openai.com/auth": {"chatgpt_plan_type": plan}}
    return f"{part({'alg': 'none'})}.{part(claims)}.c2lnbmVkLW1hZGUtdXA"


class NoLogins:
    def claude(self) -> ClaudeLogin | None:
        return None

    def codex(self) -> CodexLogin | None:
        return None


class FakeLogins:
    def __init__(self, now: datetime, left: timedelta = timedelta(hours=1)) -> None:
        self.claude_login: ClaudeLogin | None = ClaudeLogin(Secret(CLAUDE_TOKEN), now + left, "max")
        token = codex_jwt(now + left)
        self.codex_login: CodexLogin | None = CodexLogin(Secret(token), now + left, CODEX_ACCOUNT, "plus")

    def claude(self) -> ClaudeLogin | None:
        return self.claude_login

    def codex(self) -> CodexLogin | None:
        return self.codex_login


CLAUDE_USAGE: dict[str, Any] = {
    "limits": [
        {"kind": "session", "percent": 42, "resets_at": "2026-01-05T14:00:00Z", "severity": "normal"},
        {"kind": "weekly_all", "percent": 18.5, "resets_at": "2026-01-09T09:00:00Z"},
        {"kind": "weekly_scoped", "percent": 7, "resets_at": "2026-01-09T09:00:00Z",
         "scope": {"model": {"display_name": "Opus"}}},
        {"kind": "zebra_quota", "percent": 99},
    ],
    "five_hour": {"utilization": 1, "resets_at": "2026-01-05T14:00:00Z"},
}  # fmt: skip
CLAUDE_PROFILE: dict[str, Any] = {
    "account": {"email_address": "someone@example.com", "full_name": "Made Up"},
    "organization": {"uuid": ORG, "name": "Made Up Org"},
}
CODEX_USAGE: dict[str, Any] = {
    "plan_type": "plus",
    "email": "someone@example.com",
    "rate_limit": {
        "primary_window": {"used_percent": 61, "limit_window_seconds": 18000, "reset_at": 1767621600},
        "secondary_window": {"used_percent": 12, "limit_window_seconds": 604800, "reset_at": 1768050000},
    },
}


class FakeApi:
    """Replies as made up here; `calls` lists what was asked."""

    def __init__(self) -> None:
        self.claude: Any = CLAUDE_USAGE
        self.profile: Any = CLAUDE_PROFILE
        self.codex: Any = CODEX_USAGE
        self.calls: list[str] = []

    def claude_usage(self, token: Secret) -> Any:
        self.calls.append("claude_usage")
        return self.claude

    def claude_profile(self, token: Secret) -> Any:
        self.calls.append("claude_profile")
        return self.profile

    def codex_usage(self, token: Secret, account_id: str) -> Any:
        self.calls.append("codex_usage")
        return self.codex


def refusing_transport() -> httpx.MockTransport:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise AssertionError(f"a test reached {request.url.host}")

    return httpx.MockTransport(refuse)


def clock(at: datetime | None = None) -> "Clock":
    return Clock(at or datetime(2026, 1, 5, 9, 0, tzinfo=UTC))


class Clock:
    def __init__(self, at: datetime) -> None:
        self.at = at

    def __call__(self) -> datetime:
        return self.at
