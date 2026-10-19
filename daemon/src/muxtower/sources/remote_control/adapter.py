"""The only code that talks to Anthropic's Remote Control endpoints (through the vendored client)."""

from pathlib import Path
from typing import Any

from muxtower.sources.remote_control.ports import RawEvent
from muxtower.vendor.claude_rc import Event, RemoteControlClient


def _raw(event: Event) -> RawEvent:
    return RawEvent(
        seq=int(event.sequence_num or 0), created_at=event.created_at, source=event.source, payload=event.payload
    )


class AnthropicRemoteControl:
    def __init__(self, credentials_path: Path | None = None, config_path: Path | None = None) -> None:
        # Refreshing rotates the shared, single-use refresh token in ~/.claude; the client writes the new
        # one back so the Claude Code CLI on this machine keeps working (and re-reads if the CLI won).
        self.client = RemoteControlClient(
            credentials_path=str(credentials_path) if credentials_path else None,
            config_path=str(config_path) if config_path else None,
            auto_refresh=True,
            persist_refresh=True,
        )

    def list_sessions(self, cursor: str | None) -> tuple[list[dict[str, Any]], str | None]:
        page = self.client.list_sessions(limit=50, cursor=cursor)
        return list(page.get("data") or []), page.get("next_cursor")

    def get_session(self, session_id: str) -> dict[str, Any]:
        body = self.client.get_session(session_id)
        shaped = body.get("response_shape", body)
        return dict(shaped) if isinstance(shaped, dict) else {}

    def recent_events(self, session_id: str, limit: int) -> list[RawEvent]:
        return [_raw(e) for e in self.client.list_events(session_id, limit=limit, sort_order="desc")]

    def events_after(self, session_id: str, after_seq: int, limit: int) -> list[RawEvent]:
        events = self.client.list_events(session_id, limit=limit, sort_order="asc", cursor=str(after_seq))
        return [_raw(e) for e in events]

    def respond_permission(
        self, session_id: str, request_id: str, *, allow: bool, tool_input: dict[str, Any] | None,
        tool_use_id: str | None, message: str | None,
    ) -> None:  # fmt: skip
        self.client.respond_permission(
            session_id, request_id, allow=allow, tool_input=tool_input, tool_use_id=tool_use_id, message=message
        )

    def answer_question(
        self, session_id: str, request_id: str, answers: dict[str, str], *, tool_input: dict[str, Any],
        tool_use_id: str | None,
    ) -> None:  # fmt: skip
        self.client.answer_question(
            session_id, request_id, dict(answers), tool_input=tool_input, tool_use_id=tool_use_id
        )

    def send_message(self, session_id: str, text: str) -> None:
        self.client.send_message(session_id, text)

    def interrupt(self, session_id: str) -> None:
        self.client.interrupt(session_id)
