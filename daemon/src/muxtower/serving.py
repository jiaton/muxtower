"""How the app answers over HTTP: across which origins (CORS, and a tailnet's private addresses), errors
as statuses, its routes, and the web app itself."""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from muxtower.asr.routes import router as asr_router
from muxtower.attachments.models import FILENAME_HEADER
from muxtower.attachments.routes import router as attachments_router
from muxtower.auth.deps import DAEMON_AUTH_HEADER
from muxtower.auth.routes import router as auth_router
from muxtower.chips.routes import router as chips_router
from muxtower.config import Settings
from muxtower.continuing.routes import router as continue_router
from muxtower.diagnostics.routes import router as diagnostics_router
from muxtower.errors import STATUSES
from muxtower.hooks.routes import router as hooks_router
from muxtower.inbox.routes import router as inbox_router
from muxtower.infra.tmux import TmuxError
from muxtower.listen.routes import router as listen_router
from muxtower.mcp.routes import router as mcp_router
from muxtower.nodes.direct import PrivateNetworkAccess
from muxtower.nodes.routes import router as nodes_router
from muxtower.notify.routes import router as push_router
from muxtower.playbook.routes import router as playbook_router
from muxtower.recovery.routes import router as recovery_router
from muxtower.search.routes import router as search_router
from muxtower.sessions.media_routes import router as media_router
from muxtower.sessions.routes import router as sessions_router
from muxtower.settings.routes import router as settings_router
from muxtower.shared.routes import router as shared_router
from muxtower.subscriptions.routes import router as plan_usage_router
from muxtower.summaries.routes import router as summaries_router
from muxtower.system.routes import router as system_router
from muxtower.teams.routes import router as teams_router
from muxtower.terminal.stream import router as stream_router
from muxtower.triggers.routes import router as triggers_router
from muxtower.tts.routes import router as tts_router
from muxtower.usage.routes import router as usage_router
from muxtower.web import mount_ui


def serve(app: FastAPI, settings: Settings, allowed_origins: list[str], daemon_name: str) -> None:
    if allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=allowed_origins,
            allow_credentials=False,  # bearer tokens only; the stream cookie is same-origin
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=["Authorization", "Content-Type", FILENAME_HEADER, *settings.cors.extra_headers],
            expose_headers=list(DAEMON_AUTH_HEADER),
            max_age=600,
        )
        app.add_middleware(PrivateNetworkAccess)  # outside CORS: it adds to the preflight's answer

    handled: tuple[tuple[type[Exception], int], ...] = (*STATUSES, (TmuxError, 503))
    for error, status in handled:

        def handler(_: Request, exc: Exception, status: int = status) -> JSONResponse:
            headers = DAEMON_AUTH_HEADER if status == 401 else None
            return JSONResponse({"detail": str(exc)}, status_code=status, headers=headers)

        app.add_exception_handler(error, handler)

    routers = (system_router, auth_router, sessions_router, summaries_router, asr_router, mcp_router, stream_router,
               push_router, hooks_router, nodes_router, teams_router, usage_router, recovery_router,
               settings_router, chips_router, diagnostics_router, playbook_router, search_router,
               listen_router, tts_router, triggers_router, attachments_router, continue_router,
               inbox_router, shared_router, plan_usage_router, media_router)  # fmt: skip
    for router in routers:
        app.include_router(router)

    if settings.serve_ui:
        mount_ui(app, settings.public_url, daemon_name)
