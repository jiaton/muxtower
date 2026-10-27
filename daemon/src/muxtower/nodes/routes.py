"""Hub and node endpoints. As a hub: nodes join with a pairing code (`/nodes/claim`), link
(`/nodes/link`), are listed and removed. As a node: this daemon joins a hub (`/hub`)."""

import asyncio
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Request, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from muxtower.auth.deps import WS_BEARER_PREFIX, WS_SUBPROTOCOL, CurrentDevice
from muxtower.auth.routes import Audit
from muxtower.nodes import protocol
from muxtower.nodes.client import HubClient
from muxtower.nodes.hub import Nodes
from muxtower.nodes.link import NodeLink, parse
from muxtower.nodes.models import HubStatus, JoinHub, NodeClaim, NodeClaimResult, NodeInfo

logger = logging.getLogger("muxtower.nodes")
router = APIRouter(prefix="/v1", tags=["nodes"])
HELLO_SECONDS = 15


def _nodes(request: Request) -> Nodes:
    nodes: Nodes = request.app.state.nodes
    return nodes


def _hub(request: Request) -> HubClient:
    client: HubClient = request.app.state.hub
    return client


NodesDep = Annotated[Nodes, Depends(_nodes)]
HubDep = Annotated[HubClient, Depends(_hub)]


@router.post("/nodes/claim")
def claim_node(body: NodeClaim, request: Request, nodes: NodesDep, audit: Audit) -> NodeClaimResult:
    """Public: a daemon redeems a pairing code made here to join as a node. Its token opens its link
    and nothing else."""
    request.app.state.pairing.redeem(body.code, request.app.state.client_address.of(request))
    name, token = nodes.claim(body.name)
    audit.record(name, "node-joined")
    return NodeClaimResult(token=token, name=name, hub_name=request.app.state.daemon_name)


@router.get("/nodes")
def list_nodes(_: CurrentDevice, nodes: NodesDep) -> list[NodeInfo]:
    return nodes.infos()


@router.delete("/nodes/{name}", status_code=204)
def remove_node(name: str, device: CurrentDevice, nodes: NodesDep, audit: Audit) -> None:
    """Forgets a node: its link closes, its sessions leave the lists, and it can no longer link."""
    nodes.revoke(name)
    audit.record(device.name, "node-removed", detail=name)


@router.get("/hub")
def hub_status(_: CurrentDevice, hub: HubDep) -> HubStatus:
    return hub.status()


@router.post("/hub")
async def join_hub(body: JoinHub, device: CurrentDevice, hub: HubDep, audit: Audit) -> HubStatus:
    """Joins this daemon to a hub as a node, with a pairing code made on the hub."""
    status = await asyncio.to_thread(hub.join, body.url, body.code)
    audit.record(device.name, "hub-joined", detail=body.url)
    return status


@router.delete("/hub", status_code=204)
def leave_hub(device: CurrentDevice, hub: HubDep, audit: Audit) -> None:
    """Stops reporting to the hub; the hub still lists this node (offline) until it is removed there."""
    hub.leave()
    audit.record(device.name, "hub-left")


@router.websocket("/nodes/link")
async def node_link(ws: WebSocket) -> None:
    nodes: Nodes = ws.app.state.nodes
    offered = [p.strip() for p in ws.headers.get("sec-websocket-protocol", "").split(",") if p.strip()]
    token = next((p.removeprefix(WS_BEARER_PREFIX) for p in offered if p.startswith(WS_BEARER_PREFIX)), "")
    await ws.accept(subprotocol=WS_SUBPROTOCOL if WS_SUBPROTOCOL in offered else None)
    name = nodes.authenticate(token)
    if name is None:  # said after accepting, so the node can tell it apart from a gate's refusal
        await ws.close(code=protocol.CLOSE_REVOKED, reason="unknown node")
        return
    try:
        first = parse(await asyncio.wait_for(ws.receive_text(), HELLO_SECONDS)) or {}
        hello = protocol.Hello.model_validate(first.get("data") if first.get("event") == "hello" else {})
    except (TimeoutError, ValidationError, WebSocketDisconnect):
        await ws.close(code=protocol.CLOSE_INCOMPATIBLE, reason="expected hello")
        return
    if hello.protocol != protocol.PROTOCOL:
        await ws.close(code=protocol.CLOSE_INCOMPATIBLE, reason=f"protocol {protocol.PROTOCOL} only")
        return
    link = NodeLink(name, ws.send_text, lambda code: ws.close(code=code))
    await nodes.attach(name, link, hello)
    try:
        while not link.closed:
            frame = parse(await ws.receive_text())
            if frame is None:
                continue
            if "event" in frame:
                nodes.on_event(name, str(frame["event"]), frame.get("data"))
            elif "id" in frame:
                link.answered(frame)
    except (WebSocketDisconnect, RuntimeError):  # gone, or hung up from here (removed, replaced)
        pass
    finally:
        nodes.detach(name, link)
