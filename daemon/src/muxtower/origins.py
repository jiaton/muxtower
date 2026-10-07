"""Origin policy shared by the CORS middleware and the WebSocket handshake check
(browsers apply CORS to fetch, never to WebSockets)."""

from urllib.parse import urlsplit


class OriginPolicy:
    def __init__(self, allowed_origins: list[str]) -> None:
        self.allow_any = "*" in allowed_origins
        self.allowed = {o.rstrip("/") for o in allowed_origins}

    def websocket_allowed(self, origin: str | None, host: str | None) -> bool:
        if origin is None or self.allow_any:
            return True  # not a browser (CLI, scripts): the token is the only gate
        if origin.rstrip("/") in self.allowed:
            return True
        return urlsplit(origin).netloc == host
