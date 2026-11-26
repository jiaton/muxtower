from fastapi import APIRouter, Request

from muxtower.auth.deps import CurrentDevice
from muxtower.subscriptions.models import PlanUsage

router = APIRouter(prefix="/v1", tags=["plan-usage"])


@router.get("/plan-usage")
def plan_usage(request: Request, _: CurrentDevice) -> PlanUsage:
    """The Claude and Codex plans the machines here are signed into, each with how much is used and which
    machines use it; read every five minutes while the setting is on. Asking costs nothing."""
    state = request.app.state
    enabled = state.settings.plan_usage.enabled
    return PlanUsage(enabled=enabled, accounts=state.plan_book.accounts() if enabled else [])
