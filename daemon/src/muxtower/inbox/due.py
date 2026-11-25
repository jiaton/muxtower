"""Due dates, in the owner's time (`inbox.timezone`). A due with a time is kept as its instant (UTC); a date
alone as that date, and falls due at `inbox.due_hour` there: worked out each time, so it stays that hour of
the owner's day across a daylight-saving change (and follows a changed hour or zone)."""

from datetime import UTC, date, datetime, time, tzinfo

from muxtower.inbox.models import DueState, InboxStatus


def kept(due: datetime, has_time: bool, zone: tzinfo) -> tuple[datetime | None, date | None]:
    """What is stored for a due given: (its instant, None) or (None, its date). Without an offset, it is the
    owner's local time."""
    local = due.replace(tzinfo=zone) if due.tzinfo is None else due.astimezone(zone)
    if has_time:
        return local.astimezone(UTC), None
    return None, local.date()


def instant(at: datetime | None, day: date | None, zone: tzinfo, hour: int) -> datetime | None:
    """When it falls due (UTC)."""
    if at is not None:
        return at
    if day is None:
        return None
    return datetime.combine(day, time(hour), tzinfo=zone).astimezone(UTC)


def state(due: datetime | None, status: InboxStatus, now: datetime, zone: tzinfo) -> DueState:
    if due is None or status is InboxStatus.DONE:
        return DueState.NONE
    if now < due:
        return DueState.UPCOMING
    return DueState.DUE if now.astimezone(zone).date() == due.astimezone(zone).date() else DueState.OVERDUE
