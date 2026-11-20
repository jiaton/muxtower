from typing import Protocol

from muxtower.attachments.models import Attachment


class Upload(Protocol):
    """One file arriving for a session, written as it comes (here, or on the session's node)."""

    max_bytes: int  # what its machine takes (`attachments.max_mb` there)

    def write(self, data: bytes) -> None:
        """The next bytes; TooLarge once past `max_bytes`."""

    def finish(self) -> Attachment: ...

    def abort(self) -> None:
        """Nothing is kept. Safe to call more than once, and after `finish`."""
