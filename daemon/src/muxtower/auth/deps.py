"""FastAPI dependencies that authenticate a request or WebSocket with a device token."""

from typing import Annotated

from fastapi import Depends, HTTPException, Request

from muxtower.auth.ports import DeviceToken
from muxtower.auth.service import TokenService

WS_SUBPROTOCOL = "muxtower"
WS_BEARER_PREFIX = "bearer."


def get_token_service(request: Request) -> TokenService:
    service: TokenService = request.app.state.tokens
    return service


def require_device(request: Request, tokens: Annotated[TokenService, Depends(get_token_service)]) -> DeviceToken:
    scheme, _, presented = request.headers.get("authorization", "").partition(" ")
    device = tokens.verify(presented) if scheme.lower() == "bearer" else None
    if device is None:
        raise HTTPException(status_code=401, detail="missing or invalid bearer token")
    return device


CurrentDevice = Annotated[DeviceToken, Depends(require_device)]
