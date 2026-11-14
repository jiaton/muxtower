import asyncio
import json
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field, ValidationError

from muxtower.auth.deps import CurrentDevice
from muxtower.auth.routes import Audit
from muxtower.diagnostics.service import MAX_BODY_BYTES, MAX_ENTRIES, DiagnosticsService
from muxtower.errors import Invalid

router = APIRouter(prefix="/v1", tags=["diagnostics"])
logger = logging.getLogger("muxtower.diagnostics")
APP_ERRORS = "app-errors"  # the app's uncaught errors (app/src/lib/error-report.ts)


class DiagnosticsBatch(BaseModel):
    source: str = Field(pattern=r"^[a-z0-9-]{1,32}$", description="Which log: `g2` for the glasses")
    entries: list[dict[str, Any]] = Field(max_length=MAX_ENTRIES)


def _diagnostics(request: Request) -> DiagnosticsService:
    service: DiagnosticsService = request.app.state.diagnostics
    return service


@router.post(
    "/diagnostics",
    status_code=204,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {"application/json": {"schema": DiagnosticsBatch.model_json_schema()}},
        }
    },
)
async def append_diagnostics(
    request: Request, device: CurrentDevice, service: Annotated[DiagnosticsService, Depends(_diagnostics)],
    audit: Audit,
) -> Response:  # fmt: skip
    """Appends a device's diagnostic entries to `<state_dir>/diagnostics/<source>.jsonl`, one line each with
    the device's name and when it arrived. Entries must be counters and timestamps only (the app's errors:
    message, stack, version, route pattern, browser; logged too): the daemon stores them as they come, and
    nothing from them is audited."""
    body = await request.body()
    if len(body) > MAX_BODY_BYTES:
        raise Invalid("diagnostics batch too large")
    try:
        batch = DiagnosticsBatch.model_validate(json.loads(body))
    except (ValueError, ValidationError) as error:
        raise Invalid(f"bad diagnostics batch: {error}") from None
    await asyncio.to_thread(service.append, batch.source, device.name, batch.entries)
    if batch.source == APP_ERRORS:  # the app failing on a device: said in the daemon's own log too
        for entry in batch.entries[:5]:
            logger.warning(
                "app error on %s (%s, %s): %s", device.name, entry.get("version"), entry.get("route"),
                str(entry.get("message"))[:300],
            )  # fmt: skip
    await asyncio.to_thread(
        audit.record, device.name, "diagnostics", None, f"source={batch.source} n={len(batch.entries)}"
    )
    return Response(status_code=204)
