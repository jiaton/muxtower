from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(frozen=True)
class RawEvent:
    """One event of a session's log, unwrapped from the transport envelope."""

    seq: int
    created_at: str | None
    source: str | None  # "worker" (Claude Code) or "client" (a controller: claude.ai, the apps, us)
    payload: dict[str, Any] = field(default_factory=dict)


class RemoteControlPort(Protocol):
    """Anthropic's Remote Control API, as muxtower uses it (a controller, never a worker)."""

    def list_sessions(self, cursor: str | None) -> tuple[list[dict[str, Any]], str | None]: ...
    def get_session(self, session_id: str) -> dict[str, Any]: ...
    def recent_events(self, session_id: str, limit: int) -> list[RawEvent]: ...
    def events_after(self, session_id: str, after_seq: int, limit: int) -> list[RawEvent]: ...
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
    def send_message(self, session_id: str, text: str) -> None: ...
    def interrupt(self, session_id: str) -> None: ...
