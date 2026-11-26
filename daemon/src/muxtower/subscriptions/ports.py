"""What plan usage is read from: the CLIs' own sign-ins on this machine, and the providers' usage endpoints."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol


@dataclass(frozen=True, repr=False)
class Secret:
    """A token, held in memory for one poll: it never prints, so no log line or error can carry it."""

    value: str

    def __repr__(self) -> str:
        return "Secret(***)"

    __str__ = __repr__


@dataclass(frozen=True)
class ClaudeLogin:
    token: Secret
    expires_at: datetime | None  # None: not said
    plan: str | None  # subscriptionType


@dataclass(frozen=True)
class CodexLogin:
    token: Secret
    expires_at: datetime | None  # the JWT's exp, read here; None: unreadable
    account_id: str
    plan: str | None  # the JWT's plan claim, if any


class LoginPort(Protocol):
    """The sign-ins, read again on every poll; None: not signed in (or not with a plan) on this machine."""

    def claude(self) -> ClaudeLogin | None: ...

    def codex(self) -> CodexLogin | None: ...


class PlanApiPort(Protocol):
    """The providers' answers, as JSON; Unavailable when there is none. Never signs in again."""

    def claude_usage(self, token: Secret) -> Any: ...

    def claude_profile(self, token: Secret) -> Any: ...

    def codex_usage(self, token: Secret, account_id: str) -> Any: ...
