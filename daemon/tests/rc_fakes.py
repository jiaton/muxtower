from typing import Any

from muxtower.sources.remote_control.ports import RawEvent


def session(sid: str, **over: Any) -> dict[str, Any]:
    base = {
        "id": sid, "status": "active", "title": f"title {sid}", "environment_id": "env_box",
        "environment_kind": "bridge", "config": {"origin": "desktop_app"}, "worker_status": "idle",
        "status_bucket": "completed", "unread": False, "last_event_at": "2026-10-18T10:00:00Z",
        "created_at": "2026-10-18T09:00:00Z",
    }  # fmt: skip
    return {**base, **over}


def user(seq: int, text: str, source: str = "client") -> RawEvent:
    return RawEvent(seq, None, source, {"type": "user", "message": {"role": "user", "content": text}})


def assistant(seq: int, *blocks: dict[str, Any]) -> RawEvent:
    return RawEvent(
        seq, None, "worker", {"type": "assistant", "message": {"role": "assistant", "content": list(blocks)}}
    )


def tool_result(seq: int, tool_use_id: str, error: bool = False) -> RawEvent:
    block = {"type": "tool_result", "tool_use_id": tool_use_id, "content": "ok", "is_error": error}
    return RawEvent(seq, None, "worker", {"type": "user", "message": {"role": "user", "content": [block]}})


def permission(seq: int, request_id: str, tool: str, tool_input: dict[str, Any]) -> RawEvent:
    request = {"subtype": "can_use_tool", "tool_name": tool, "input": tool_input, "tool_use_id": f"tu_{request_id}"}
    return RawEvent(seq, None, "worker", {"type": "control_request", "request_id": request_id, "request": request})


def answered(seq: int, request_id: str, behavior: str = "allow", answers: dict[str, str] | None = None) -> RawEvent:
    inner: dict[str, Any] = {"behavior": behavior}
    if answers is not None:
        inner["updatedInput"] = {"answers": answers}
    response = {"subtype": "success", "request_id": request_id, "response": inner}
    return RawEvent(seq, None, "client", {"type": "control_response", "response": response})


class FakeRemoteControl:
    """In-memory RemoteControlPort: tests set sessions/events/details and read back the calls."""

    def __init__(self) -> None:
        self.sessions: list[dict[str, Any]] = []
        self.events: dict[str, list[RawEvent]] = {}
        self.details: dict[str, dict[str, Any]] = {}
        self.calls: list[tuple[Any, ...]] = []

    def list_sessions(self, cursor: str | None) -> tuple[list[dict[str, Any]], str | None]:
        return list(self.sessions), None

    def get_session(self, session_id: str) -> dict[str, Any]:
        listed = next((s for s in self.sessions if s["id"] == session_id), {})
        return {**listed, **self.details.get(session_id, {})}

    def recent_events(self, session_id: str, limit: int) -> list[RawEvent]:
        return list(reversed(self.events.get(session_id, [])[-limit:]))

    def events_after(self, session_id: str, after_seq: int, limit: int) -> list[RawEvent]:
        return [e for e in self.events.get(session_id, []) if e.seq > after_seq][:limit]

    def events_before(self, session_id: str, before_seq: int | None, limit: int) -> list[RawEvent]:
        older = [e for e in self.events.get(session_id, []) if before_seq is None or e.seq < before_seq]
        return list(reversed(older[-limit:]))

    def respond_permission(self, session_id: str, request_id: str, **kw: Any) -> None:
        self.calls.append(("permission", session_id, request_id, kw["allow"], kw["tool_input"]))

    def answer_question(self, session_id: str, request_id: str, answers: dict[str, str], **kw: Any) -> None:
        self.calls.append(("answer", session_id, request_id, answers))

    def send_message(self, session_id: str, text: str, images: list[Any] | None = None) -> None:
        self.calls.append(("message", session_id, text, *([len(images)] if images else [])))

    def interrupt(self, session_id: str) -> None:
        self.calls.append(("interrupt", session_id))

    def mark_read(self, session_id: str) -> None:
        self.calls.append(("mark_read", session_id))

    def archive_session(self, session_id: str) -> None:
        self.calls.append(("archive", session_id))
        self.sessions = [s for s in self.sessions if s["id"] != session_id]
