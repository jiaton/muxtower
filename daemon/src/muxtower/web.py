"""Serves the bundled web app (copied into muxtower/web/ at wheel build time) with an SPA fallback,
plus /config.json telling the app which daemon it came from. Sub-apps built alongside it (the G2
glasses app in web/g2/) are served from their own folder with their own index.html.

Only the built assets (`assets/`, content-hashed names) may be cached. Everything else keeps its name
across versions, above all the service worker: a cached one (a CDN in front caches .js for hours by
default) keeps every open app on its old version."""

from importlib import resources
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response

WEB_DIR = Path(str(resources.files("muxtower"))) / "web"
SUB_APPS = ("g2",)
IMMUTABLE = {"Cache-Control": "public, max-age=31536000, immutable"}
NO_CACHE = {"Cache-Control": "no-cache"}


def mount_ui(app: FastAPI, public_url: str | None, daemon_name: str) -> None:
    index = WEB_DIR / "index.html"

    @app.get("/config.json", include_in_schema=False)
    def config(request: Request) -> JSONResponse:
        url = public_url or str(request.base_url).rstrip("/")
        # The bundled UI offers to pair with the daemon that served it. Never includes a token.
        return JSONResponse({"daemons": [{"name": daemon_name, "url": url}]})

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> Response:
        if path.startswith("v1/") or path == "v1":
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        candidate = (WEB_DIR / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(WEB_DIR.resolve()):
            return FileResponse(candidate, headers=IMMUTABLE if "assets" in Path(path).parts[:2] else NO_CACHE)
        sub = path.split("/", 1)[0]
        if sub in SUB_APPS and (WEB_DIR / sub / "index.html").is_file():
            if path == sub:  # its assets are relative to the folder
                return RedirectResponse(f"/{sub}/")
            return FileResponse(WEB_DIR / sub / "index.html", headers=NO_CACHE)
        if index.is_file():
            return FileResponse(index, headers=NO_CACHE)
        return JSONResponse(
            {"detail": "web UI not bundled in this build; run `make wheel` or use a hosted app"},
            status_code=404,
        )
