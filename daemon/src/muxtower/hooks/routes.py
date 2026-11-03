from fastapi import APIRouter, HTTPException, Request, Response

from muxtower.hooks.events import SESSION_HEADER
from muxtower.hooks.harnesses import harness

router = APIRouter(prefix="/v1/hooks", include_in_schema=False)


@router.post("/{name}")
async def receive_hook(name: str, request: Request) -> Response:
    """Receives the hook events of sessions muxtower launched, from the harness `name` (claude-code,
    codex). Always answers with an empty 200 so the agent proceeds exactly as it would without the hook."""
    found = harness(name)
    if found is None:
        raise HTTPException(status_code=404, detail="no such hook harness")
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    session_id = request.headers.get(SESSION_HEADER.lower(), "")
    if scheme.lower() != "bearer" or not token or not session_id:
        raise HTTPException(status_code=401, detail="missing hook credentials")
    try:
        event = found.event(await request.body())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="not a hook event") from exc
    app = request.app.state
    if app.sessions.apply_hook(session_id, token, event):
        app.bus.publish(f"attention:{session_id}", None)
    app.bus.publish("sessions", None)
    app.monitor.wake()  # its state changed: its screen most likely too
    return Response(status_code=200)
