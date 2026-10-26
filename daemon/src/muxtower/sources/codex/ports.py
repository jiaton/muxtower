from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(frozen=True)
class Message:
    """What the app-server pushes: a notification (`id` None) or a request it waits on an answer to."""

    method: str
    params: dict[str, Any] = field(default_factory=dict)
    id: int | str | None = None


class AppServerPort(Protocol):
    """Codex's app-server (JSON-RPC over a websocket), as muxtower drives it: one connection, kept up."""

    def ensure(self) -> bool:
        """Started and connected (again, after a crash); False while it cannot be."""
        ...

    def request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        """Blocking: the result, or raises Unavailable (down, timed out) / Conflict (an error answer)."""
        ...

    def respond(self, request_id: int | str, result: dict[str, Any]) -> None: ...

    def next_message(self, timeout: float) -> Message | None:
        """Blocking: the next pushed message, None when none came in `timeout` seconds."""
        ...

    def close(self) -> None: ...
