from enum import StrEnum

from pydantic import BaseModel


class SummaryState(StrEnum):
    READY = "ready"  # in the session's reply_summary now
    PENDING = "pending"  # being made; a sessions update follows
    NOT_NEEDED = "not_needed"  # the reply is short enough to read as it is
    UNAVAILABLE = "unavailable"  # no summarizer configured on this hub


class SummaryStatus(BaseModel):
    state: SummaryState
