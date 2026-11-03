"""MCP over HTTP ("streamable HTTP", JSON responses only): just enough of the protocol for an agent to
list and call muxtower's tools. Authenticated with a device token, or with a session's own token (a session
muxtower started: `caller.py`), which reaches nothing but this route."""

import asyncio
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from pydantic import ValidationError

from muxtower import __version__
from muxtower.auth.deps import DAEMON_AUTH_HEADER, get_token_service
from muxtower.auth.routes import Audit
from muxtower.auth.service import TokenService
from muxtower.errors import Conflict, Forbidden, Invalid, NotFound, Unavailable
from muxtower.infra.audit import AuditLog
from muxtower.infra.tmux import TmuxError
from muxtower.mcp.caller import CALLER, Caller, parse_session_token
from muxtower.mcp.service import McpTools
from muxtower.mcp.team_tools import INSTRUCTIONS

logger = logging.getLogger("muxtower.mcp")
router = APIRouter(prefix="/v1", tags=["mcp"])

PROTOCOL_VERSIONS = ("2025-06-18", "2025-03-26", "2024-11-05")
PARSE_ERROR, INVALID_REQUEST, METHOD_NOT_FOUND, INVALID_PARAMS = -32700, -32600, -32601, -32602
TOOL_ERRORS = (NotFound, Conflict, Invalid, Forbidden, Unavailable, TmuxError)


def _tools(request: Request) -> McpTools:
    tools: McpTools = request.app.state.mcp
    return tools


Tools = Annotated[McpTools, Depends(_tools)]


def require_caller(request: Request, tokens: Annotated[TokenService, Depends(get_token_service)]) -> Caller:
    scheme, _, presented = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() == "bearer":
        if device := tokens.verify(presented):
            return Caller(device.name)
        if (parsed := parse_session_token(presented)) and request.app.state.sessions.holds_token(*parsed):
            return Caller(f"session {parsed[0]}", parsed[0])
    raise HTTPException(status_code=401, detail="missing or invalid bearer token", headers=DAEMON_AUTH_HEADER)


CurrentCaller = Annotated[Caller, Depends(require_caller)]


def _error(msg_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "message": message}}


async def _call(tools: McpTools, params: dict[str, Any], caller: Caller, audit: AuditLog) -> dict[str, Any]:
    tool = tools.tools.get(str(params.get("name")))
    if tool is None:
        raise KeyError(params.get("name"))
    args = tool.args.model_validate(params.get("arguments") or {})
    session_id = getattr(args, "session_id", None)
    CALLER.set(caller)  # the tool's thread runs in a copy of this context
    try:
        text, is_error = await asyncio.to_thread(tool.run, args), False
    except TOOL_ERRORS as exc:
        text, is_error = str(exc) or type(exc).__name__, True
    await asyncio.to_thread(audit.record, caller.actor, f"mcp:{tool.name}", session_id, "error" if is_error else None)
    return {"content": [{"type": "text", "text": text}], "isError": is_error}


async def _handle(message: Any, tools: McpTools, caller: Caller, audit: AuditLog) -> dict[str, Any] | None:
    if not isinstance(message, dict) or message.get("jsonrpc") != "2.0" or "method" not in message:
        return _error(message.get("id") if isinstance(message, dict) else None, INVALID_REQUEST, "invalid request")
    if "id" not in message:
        return None  # a notification (e.g. notifications/initialized)
    msg_id, method = message["id"], message["method"]
    params = message.get("params") or {}
    if method == "initialize":
        wanted = params.get("protocolVersion")
        version = wanted if wanted in PROTOCOL_VERSIONS else PROTOCOL_VERSIONS[0]
        result: dict[str, Any] = {
            "protocolVersion": version,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": "muxtower", "version": __version__},
        }
        if "my_team" in tools.tools:
            result["instructions"] = INSTRUCTIONS
    elif method == "ping":
        result = {}
    elif method == "tools/list":
        result = {"tools": [t.schema() for t in tools.tools.values()]}
    elif method == "tools/call":
        try:
            result = await _call(tools, params, caller, audit)
        except KeyError:
            return _error(msg_id, INVALID_PARAMS, f"unknown tool {params.get('name')!r}")
        except ValidationError as exc:
            return _error(msg_id, INVALID_PARAMS, f"bad arguments: {exc.errors()[0]['msg']}")
    else:
        return _error(msg_id, METHOD_NOT_FOUND, f"method not found: {method}")
    return {"jsonrpc": "2.0", "id": msg_id, "result": result}


@router.post("/mcp", include_in_schema=False)
async def mcp(request: Request, caller: CurrentCaller, tools: Tools, audit: Audit) -> Response:
    try:
        body = await request.json()
    except ValueError:
        return JSONResponse(_error(None, PARSE_ERROR, "parse error"), status_code=400)
    messages = body if isinstance(body, list) else [body]
    replies = [r for m in messages if (r := await _handle(m, tools, caller, audit)) is not None]
    if not replies:
        return Response(status_code=202)
    return JSONResponse(replies if isinstance(body, list) else replies[0])


@router.get("/mcp", include_in_schema=False)
def mcp_stream(_: CurrentCaller) -> Response:
    """No server-initiated messages: there is no stream to open."""
    return Response(status_code=405, headers={"Allow": "POST"})
