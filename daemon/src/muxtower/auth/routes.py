from typing import Annotated

from fastapi import APIRouter, Depends, Request

from muxtower.auth.deps import CurrentDevice, get_token_service
from muxtower.auth.models import ClaimRequest, ClaimResult, Device, PairCode
from muxtower.auth.pairing import PairingService
from muxtower.auth.service import TokenService
from muxtower.errors import NotFound
from muxtower.infra.audit import AuditLog

router = APIRouter(prefix="/v1", tags=["devices"])


def get_pairing(request: Request) -> PairingService:
    service: PairingService = request.app.state.pairing
    return service


def get_audit(request: Request) -> AuditLog:
    audit: AuditLog = request.app.state.audit
    return audit


Pairing = Annotated[PairingService, Depends(get_pairing)]
Tokens = Annotated[TokenService, Depends(get_token_service)]
Audit = Annotated[AuditLog, Depends(get_audit)]


@router.post("/pair/codes")
def create_pair_code(device: CurrentDevice, pairing: Pairing, audit: Audit) -> PairCode:
    """A paired device (or the CLI) asks for a one-time code to hand to a new device."""
    audit.record(device.name, "pair-code")
    return pairing.create_code(device.name)


@router.post("/pair/claim")
def claim_pair_code(body: ClaimRequest, request: Request, pairing: Pairing, audit: Audit) -> ClaimResult:
    """Public: redeems a one-time code for this device's own token."""
    result = pairing.claim(body.code, body.device_name, request.app.state.client_address.of(request))
    audit.record(result.device_name, "paired")
    return result


@router.get("/devices")
def list_devices(device: CurrentDevice, tokens: Tokens) -> list[Device]:
    return [
        Device(name=t.name, created_at=t.created_at, last_used_at=t.last_used_at, current=t.name == device.name)
        for t in tokens.list()
    ]


@router.delete("/devices/{name}", status_code=204)
def revoke_device(name: str, request: Request, device: CurrentDevice, tokens: Tokens, audit: Audit) -> None:
    if not tokens.revoke(name):
        raise NotFound(f"no device named {name!r}")
    audit.record(device.name, "revoke-device", detail=name)
    request.app.state.direct.revoke(name)  # its tokens on the nodes too (`nodes/direct.py`)
