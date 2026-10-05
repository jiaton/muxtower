"""FastAPI application factory: wires settings, adapters and services into app.state."""

import socket

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from muxtower import __version__
from muxtower.auth.repository import SqliteTokenRepository
from muxtower.auth.service import TokenService
from muxtower.config import Settings
from muxtower.infra.db import Database
from muxtower.origins import OriginPolicy
from muxtower.system.routes import router as system_router
from muxtower.web import mount_ui


def build_token_service(settings: Settings) -> TokenService:
    db = Database(settings.db_path)
    db.migrate()
    return TokenService(SqliteTokenRepository(db))


def create_app(settings: Settings) -> FastAPI:
    app = FastAPI(title="muxtower", version=__version__)
    app.state.settings = settings
    app.state.daemon_name = socket.gethostname()
    app.state.tokens = build_token_service(settings)
    app.state.origins = OriginPolicy(settings.cors.allowed_origins)

    if settings.cors.allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors.allowed_origins,
            allow_credentials=False,  # bearer tokens only, never cookies
            allow_methods=["GET", "POST", "PATCH", "DELETE"],
            allow_headers=["Authorization", "Content-Type"],
            max_age=600,
        )

    app.include_router(system_router)

    if settings.serve_ui:
        mount_ui(app, settings.public_url, app.state.daemon_name)
    return app
