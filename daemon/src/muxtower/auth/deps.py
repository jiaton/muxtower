"""FastAPI dependencies that authenticate a request or WebSocket with a device token."""

from typing import Annotated

from fastapi import Depends, HTTPException, Request, WebSocket

from muxtower.auth.ports import DeviceToken
from muxtower.auth.service import TokenService

WS_SUBPROTOCOL = "muxtower"
WS_BEARER_PREFIX = "bearer."


def get_token_service(request: Request) -> TokenService:
    service: TokenService = request.app.state.tokens
    return service


def require_device(
    request: Request, tokens: Annotated[TokenService, Depends(get_token_service)]
) -> DeviceToken:
    scheme, _, presented = request.headers.get("authorization", "").partition(" ")
    device = tokens.verify(presented) if scheme.lower() == "bearer" else None
    if device is None:
        raise HTTPException(status_code=401, detail="missing or invalid bearer token")
    return device


def websocket_token(websocket: WebSocket) -> str:
    """Browsers cannot set headers on a WebSocket: prefer `Sec-WebSocket-Protocol: muxtower,
    bearer.<token>`, fall back to `?token=` for proxies that only forward query tokens."""
    offered = [p.strip() for p in websocket.headers.get("sec-websocket-protocol", "").split(",")]
    for proto in offered:
        if proto.startswith(WS_BEARER_PREFIX):
            return proto.removeprefix(WS_BEARER_PREFIX)
    return websocket.query_params.get("token", "")


CurrentDevice = Annotated[DeviceToken, Depends(require_device)]
