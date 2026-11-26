"""The providers' replies as windows: read defensively, so a field missing or changed hides that figure (null)
and never fails the rest. Keys not listed here (new limits, codenames) are left out."""

import hashlib
from datetime import UTC, datetime
from typing import Any

from muxtower.subscriptions.models import Provider, UsageWindow, WindowKind

SESSION_SECONDS = 5 * 3600
WEEK_SECONDS = 7 * 86400


def account_key(provider: Provider, provider_id: str) -> str:
    """An account's key: the same on every machine signed into it, and no name, address or id in clear."""
    return hashlib.sha256(f"{provider.value}:{provider_id}".encode()).hexdigest()[:16]


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _percent(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(min(max(value, 0), 100))


def when(value: Any) -> datetime | None:
    """An instant as ISO text or epoch seconds (milliseconds when that large); None otherwise."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float) and value > 0:
        seconds = value / 1000 if value > 10**11 else value
        try:
            return datetime.fromtimestamp(seconds, UTC)
        except (OverflowError, OSError, ValueError):
            return None
    if isinstance(value, str) and value:
        try:
            at = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        return at if at.tzinfo else at.replace(tzinfo=UTC)
    return None


def _claude_limit(limit: dict[str, Any]) -> UsageWindow | None:
    kind = limit.get("kind")
    percent, resets = _percent(limit.get("percent")), when(limit.get("resets_at"))
    if kind == "session":
        return UsageWindow(id="session", kind=WindowKind.SESSION, label="5-hour session", seconds=SESSION_SECONDS,
                           percent=percent, resets_at=resets)  # fmt: skip
    if kind == "weekly_all":
        return UsageWindow(id="weekly", kind=WindowKind.WEEKLY, label="Week, all models", seconds=WEEK_SECONDS,
                           percent=percent, resets_at=resets)  # fmt: skip
    if kind == "weekly_scoped":
        model = _dict(_dict(limit.get("scope")).get("model")).get("display_name")
        if not isinstance(model, str) or not model:
            return None
        return UsageWindow(id=f"weekly:{model.lower()}", kind=WindowKind.WEEKLY_SCOPED, label=f"Week, {model}",
                           model=model, seconds=WEEK_SECONDS, percent=percent, resets_at=resets)  # fmt: skip
    return None


def claude_windows(reply: Any) -> list[UsageWindow]:
    """`limits[]` when the reply has it, else the older `five_hour` / `seven_day`."""
    reply = _dict(reply)
    limits = reply.get("limits")
    if isinstance(limits, list) and limits:
        found = [w for limit in limits if (w := _claude_limit(_dict(limit))) is not None]
        return list({w.id: w for w in found}.values())  # one per id
    windows = []
    for key, kind, wid, label, seconds in (
        ("five_hour", WindowKind.SESSION, "session", "5-hour session", SESSION_SECONDS),
        ("seven_day", WindowKind.WEEKLY, "weekly", "Week, all models", WEEK_SECONDS),
    ):
        if isinstance(reply.get(key), dict):
            window = reply[key]
            windows.append(UsageWindow(id=wid, kind=kind, label=label, seconds=seconds,
                                       percent=_percent(window.get("utilization")),
                                       resets_at=when(window.get("resets_at"))))  # fmt: skip
    return windows


def claude_org(profile: Any) -> str | None:
    org = _dict(_dict(profile).get("organization")).get("uuid")
    return org if isinstance(org, str) and org else None


def _length(seconds: int) -> str:
    return f"{seconds // 86400}-day window" if seconds % 86400 == 0 else f"{round(seconds / 3600)}-hour window"


def _codex_window(window: dict[str, Any]) -> UsageWindow | None:
    raw = window.get("limit_window_seconds")
    seconds = int(raw) if isinstance(raw, int | float) and not isinstance(raw, bool) and raw > 0 else None
    percent = _percent(window.get("used_percent"))
    resets = when(window.get("reset_at"))
    after = window.get("reset_after_seconds")
    if resets is None and isinstance(after, int | float) and not isinstance(after, bool) and after >= 0:
        resets = datetime.fromtimestamp(datetime.now(UTC).timestamp() + after, UTC)
    if seconds == SESSION_SECONDS:
        return UsageWindow(id="session", kind=WindowKind.SESSION, label="5-hour session", seconds=seconds,
                           percent=percent, resets_at=resets)  # fmt: skip
    if seconds == WEEK_SECONDS:
        return UsageWindow(id="weekly", kind=WindowKind.WEEKLY, label="Week", seconds=seconds, percent=percent,
                           resets_at=resets)  # fmt: skip
    if seconds is None:
        return None  # a window of no known length says nothing the app could name
    return UsageWindow(id=f"{seconds}s", kind=WindowKind.OTHER, label=_length(seconds), seconds=seconds,
                       percent=percent, resets_at=resets)  # fmt: skip


def codex_windows(reply: Any) -> list[UsageWindow]:
    limits = _dict(_dict(reply).get("rate_limit"))
    found = [w for key in ("primary_window", "secondary_window") if (w := _codex_window(_dict(limits.get(key))))]
    return list({w.id: w for w in found}.values())


def codex_plan(reply: Any) -> str | None:
    plan = _dict(reply).get("plan_type")
    return plan if isinstance(plan, str) and plan else None


def limited_by(windows: list[UsageWindow]) -> datetime | None:
    """Until when a window used up holds the account back: the latest reset of those at 100%."""
    full = [w.resets_at for w in windows if w.percent is not None and w.percent >= 100 and w.resets_at is not None]
    return max(full) if full else None


def rate_limit_event(payload: Any) -> tuple[bool, datetime | None] | None:
    """Claude Code's `rate_limit_event`: (refused now, until when); None for any other event."""
    payload = _dict(payload)
    if payload.get("type") != "rate_limit_event":
        return None
    info = _dict(payload.get("rate_limit_info"))
    return info.get("status") == "rejected", when(info.get("resetsAt"))
