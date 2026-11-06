"""The only code that talks to Anthropic's Remote Control endpoints (through the vendored client).

Its failures leave as domain errors: a refused control request is a Conflict, an unknown session
NotFound, an expired login LoginExpired, anything else (network, HTTP status) Unavailable. Messages carry no
response bodies, which can echo request content.
"""

import threading
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import httpx

from muxtower.errors import Conflict, LoginExpired, NotFound, Unavailable
from muxtower.sources.remote_control.ports import RawEvent
from muxtower.terminal.models import ImageInput
from muxtower.vendor.claude_rc import (
    APIError,
    ControlRejected,
    ControlTimeout,
    CredentialsError,
    Event,
    RemoteControlClient,
)
from muxtower.vendor.claude_rc.events import cli_user_message


def _raw(event: Event) -> RawEvent:
    return RawEvent(
        seq=int(event.sequence_num or 0), created_at=event.created_at, source=event.source, payload=event.payload
    )


@contextmanager
def _translated() -> Iterator[None]:
    try:
        yield
    except ControlRejected as exc:
        raise Conflict(f"the session refused: {exc}") from exc
    except ControlTimeout as exc:
        raise Unavailable("the session did not answer in time") from exc
    except APIError as exc:
        if exc.status == 404:
            raise NotFound("Remote Control does not know this session") from exc
        if exc.status == 401:  # still refused after the client renewed its token, or could not
            raise LoginExpired("the Claude login on the daemon's machine is missing or expired") from exc
        raise Unavailable(f"Remote Control answered HTTP {exc.status}") from exc
    except CredentialsError as exc:
        raise LoginExpired("the Claude login on the daemon's machine is missing or expired") from exc
    except httpx.HTTPError as exc:
        raise Unavailable(f"cannot reach Remote Control ({type(exc).__name__})") from exc


class AnthropicRemoteControl:
    def __init__(self, credentials_path: Path | None = None, config_path: Path | None = None) -> None:
        self._paths = (credentials_path, config_path)
        self._client: RemoteControlClient | None = None
        # One call at a time: the poll and requests share the client, and its token refresh (a
        # single-use refresh token) is not safe to run twice at once.
        self._lock = threading.Lock()

    @property
    def client(self) -> RemoteControlClient:
        """Made on first use, always inside `_call`: on a machine not logged in yet that call fails as an
        expired login (and the next one tries again) instead of the daemon failing to start."""
        if self._client is None:
            credentials_path, config_path = self._paths
            # Refreshing rotates the shared, single-use refresh token in ~/.claude; the client writes the
            # new one back so the Claude Code CLI on this machine keeps working (and re-reads if it won).
            self._client = RemoteControlClient(
                credentials_path=str(credentials_path) if credentials_path else None,
                config_path=str(config_path) if config_path else None,
                auto_refresh=True,
                persist_refresh=True,
            )
        return self._client

    @contextmanager
    def _call(self) -> Iterator[None]:
        with self._lock, _translated():
            yield

    def list_sessions(self, cursor: str | None) -> tuple[list[dict[str, Any]], str | None]:
        with self._call():
            page = self.client.list_sessions(limit=50, cursor=cursor)
        return list(page.get("data") or []), page.get("next_cursor")

    def get_session(self, session_id: str) -> dict[str, Any]:
        with self._call():
            body = self.client.get_session(session_id)
        shaped = body.get("response_shape", body)
        return dict(shaped) if isinstance(shaped, dict) else {}

    def recent_events(self, session_id: str, limit: int) -> list[RawEvent]:
        with self._call():
            events = self.client.list_events(session_id, limit=limit, sort_order="desc")
        return [_raw(e) for e in events]

    def mark_read(self, session_id: str) -> None:
        with self._call():
            self.client.mark_read(session_id)

    def events_after(self, session_id: str, after_seq: int, limit: int) -> list[RawEvent]:
        with self._call():
            events = self.client.list_events(session_id, limit=limit, sort_order="asc", cursor=str(after_seq))
        return [_raw(e) for e in events]

    def events_before(self, session_id: str, before_seq: int | None, limit: int) -> list[RawEvent]:
        cursor = None if before_seq is None else str(before_seq)
        with self._call():
            events = self.client.list_events(session_id, limit=limit, sort_order="desc", cursor=cursor)
        return [_raw(e) for e in events]

    def respond_permission(
        self, session_id: str, request_id: str, *, allow: bool, tool_input: dict[str, Any] | None,
        tool_use_id: str | None, message: str | None,
    ) -> None:  # fmt: skip
        with self._call():
            self.client.respond_permission(
                session_id, request_id, allow=allow, tool_input=tool_input, tool_use_id=tool_use_id, message=message
            )

    def answer_question(
        self, session_id: str, request_id: str, answers: dict[str, str], *, tool_input: dict[str, Any],
        tool_use_id: str | None,
    ) -> None:  # fmt: skip
        with self._call():
            self.client.answer_question(
                session_id, request_id, dict(answers), tool_input=tool_input, tool_use_id=tool_use_id
            )

    def send_message(self, session_id: str, text: str, images: list[ImageInput]) -> None:
        with self._call():
            if not images:
                self.client.send_message(session_id, text)
                return
            # The images ahead of the words, as Claude Code itself sends a pasted image.
            message = cli_user_message(text)
            message["message"]["content"][:0] = [
                {"type": "image", "source": {"type": "base64", "media_type": i.media_type, "data": i.data}}
                for i in images
            ]
            self.client.send_events(session_id, [message])

    def interrupt(self, session_id: str) -> None:
        with self._call():
            self.client.interrupt(session_id)

    def rename_session(self, session_id: str, title: str) -> None:
        """Its title where every controller lists it; a connected worker (Claude Code) takes it too."""
        with self._call():
            self.client.rename_session(session_id, title)

    def archive_session(self, session_id: str) -> None:
        with self._call():
            self.client.archive_session(session_id)  # already archived counts as done
