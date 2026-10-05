"""Serves the bundled web app (copied into muxtower/web/ at wheel build time) with an SPA fallback,
plus /config.json telling the app which daemon it came from."""

from importlib import resources
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response

WEB_DIR = Path(str(resources.files("muxtower"))) / "web"


def mount_ui(app: FastAPI, public_url: str | None, daemon_name: str) -> None:
    index = WEB_DIR / "index.html"

    @app.get("/config.json", include_in_schema=False)
    def config(request: Request) -> JSONResponse:
        url = public_url or str(request.base_url).rstrip("/")
        return JSONResponse({"bundled_daemon": {"name": daemon_name, "url": url}})

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> Response:
        if path.startswith("v1/") or path == "v1":
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        candidate = (WEB_DIR / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(WEB_DIR.resolve()):
            return FileResponse(candidate)
        if index.is_file():
            return FileResponse(index, headers={"Cache-Control": "no-cache"})
        return JSONResponse(
            {"detail": "web UI not bundled in this build; run `./tasks.sh wheel` or use a hosted app"},
            status_code=404,
        )
