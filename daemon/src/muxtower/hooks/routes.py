from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import ValidationError

from muxtower.hooks.claude_code import SESSION_HEADER, HookEvent

router = APIRouter(prefix="/v1/hooks", include_in_schema=False)


@router.post("/claude-code")
async def claude_code_hook(request: Request) -> Response:
    """Receives Claude Code http hooks for sessions muxtower launched. Always answers with an empty
    200 so Claude Code proceeds exactly as it would without the hook."""
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    session_id = request.headers.get(SESSION_HEADER.lower(), "")
    if scheme.lower() != "bearer" or not token or not session_id:
        raise HTTPException(status_code=401, detail="missing hook credentials")
    try:
        event = HookEvent.model_validate_json(await request.body())
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail="not a hook event") from exc
    app = request.app.state
    if app.sessions.apply_hook(session_id, token, event):
        app.bus.publish(f"attention:{session_id}", None)
    app.bus.publish("sessions", None)
    return Response(status_code=200)
