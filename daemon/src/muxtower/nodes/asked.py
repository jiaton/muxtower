"""What a node asks of its hub (protocol 2): a team tool one of its sessions called, answered here, where
every session is seen. The caller is the node's session as the hub lists it (`<node>~<id>`), so a node
speaks only for its own sessions."""

import asyncio
import logging
from typing import Any

from pydantic import ValidationError

from muxtower.errors import Invalid
from muxtower.mcp.caller import CALLER, Caller
from muxtower.mcp.service import McpTools
from muxtower.nodes import protocol
from muxtower.nodes.source import SEPARATOR

logger = logging.getLogger("muxtower.nodes")


def _team_tool(tools: McpTools, node: str, params: dict[str, Any]) -> str:
    name = str(params.get("tool"))
    tool = tools.tools.get(name)
    if name not in protocol.TEAM_TOOLS | protocol.REACH_TOOLS | protocol.LISTING_TOOLS or tool is None:
        raise Invalid(f"no team tool {name!r} here")
    try:
        args = tool.args.model_validate(params.get("arguments") or {})
    except ValidationError as exc:
        raise Invalid(f"bad arguments: {exc.errors()[0]['msg']}") from exc
    session = params.get("session_id")
    CALLER.set(Caller(f"node {node}", f"{node}{SEPARATOR}{session}" if session else None))
    return tool.run(args)


async def answer(tools: McpTools, node: str, frame: dict[str, Any]) -> str:
    """The reply frame to a node's request."""
    method, params = frame.get("method"), frame.get("params") or {}
    try:
        if method not in protocol.HUB_METHODS:
            raise Invalid(f"unknown method {method}")
        text = await asyncio.to_thread(_team_tool, tools, node, params)
        return protocol.answer(frame["id"], {"text": text})
    except Exception as exc:  # noqa: BLE001 - every failure goes back to the node as its status
        if protocol.status_of(exc) == 502:
            logger.exception("%s's %s failed here", node, method)
        return protocol.failure(frame["id"], exc)
