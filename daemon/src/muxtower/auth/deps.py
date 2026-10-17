"""FastAPI dependencies that authenticate a request or WebSocket with a device token."""

from typing import Annotated

from fastapi import Depends, HTTPException, Request

from muxtower.auth.ports import DeviceToken
from muxtower.auth.service import TokenService

WS_SUBPROTOCOL = "muxtower"
# On every 401 muxtower itself sends, so a client can tell "this daemon rejected the token" from "a
# proxy or gate in front of it refused the request" (which says nothing about the token).
DAEMON_AUTH_HEADER = {"X-Muxtower-Auth": "invalid-credentials"}
WS_BEARER_PREFIX = "bearer."


def get_token_service(request: Request) -> TokenService:
    service: TokenService = request.app.state.tokens
    return service


def require_device(request: Request, tokens: Annotated[TokenService, Depends(get_token_service)]) -> DeviceToken:
    scheme, _, presented = request.headers.get("authorization", "").partition(" ")
    device = tokens.verify(presented) if scheme.lower() == "bearer" else None
    if device is None:
        raise HTTPException(status_code=401, detail="missing or invalid bearer token", headers=DAEMON_AUTH_HEADER)
    return device


CurrentDevice = Annotated[DeviceToken, Depends(require_device)]
