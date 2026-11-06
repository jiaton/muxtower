from typing import Any, Protocol

from muxtower.claude_conversation import RawEvent
from muxtower.terminal.models import ImageInput

__all__ = ["RawEvent", "RemoteControlPort"]  # RawEvent: what the adapter returns


class RemoteControlPort(Protocol):
    """Anthropic's Remote Control API, as muxtower uses it (a controller, never a worker)."""

    def list_sessions(self, cursor: str | None) -> tuple[list[dict[str, Any]], str | None]: ...
    def get_session(self, session_id: str) -> dict[str, Any]: ...
    def recent_events(self, session_id: str, limit: int) -> list[RawEvent]: ...
    def mark_read(self, session_id: str) -> None: ...
    def events_after(self, session_id: str, after_seq: int, limit: int) -> list[RawEvent]: ...
    def events_before(self, session_id: str, before_seq: int | None, limit: int) -> list[RawEvent]:
        """Newest first: the latest events, or those before `before_seq`."""
        ...

    def respond_permission(
        self,
        session_id: str,
        request_id: str,
        *,
        allow: bool,
        tool_input: dict[str, Any] | None,
        tool_use_id: str | None,
        message: str | None,
    ) -> None: ...  # fmt: skip
    def answer_question(
        self,
        session_id: str,
        request_id: str,
        answers: dict[str, str],
        *,
        tool_input: dict[str, Any],
        tool_use_id: str | None,
    ) -> None: ...  # fmt: skip
    def send_message(self, session_id: str, text: str, images: list[ImageInput]) -> None: ...
    def interrupt(self, session_id: str) -> None: ...
    def archive_session(self, session_id: str) -> None: ...
    def rename_session(self, session_id: str, title: str) -> None: ...
