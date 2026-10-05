"""`muxtowerd`: run the daemon, or `muxtowerd export-openapi` to print the API contract."""

import argparse
import json
import logging
import re
import sys
from pathlib import Path

import uvicorn

from muxtower.app import create_app
from muxtower.config import load_settings


class RedactTokenFilter(logging.Filter):
    """Access log lines include the request path; strip `?token=` so tokens never reach a log."""

    _pattern = re.compile(r"([?&]token=)[^&\s\"]+")

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple):
            record.args = tuple(
                self._pattern.sub(r"\1[redacted]", a) if isinstance(a, str) else a for a in record.args
            )
        return True


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="muxtowerd", description="muxtower daemon")
    p.add_argument("command", nargs="?", choices=["serve", "export-openapi"], default="serve")
    p.add_argument("--config", type=Path, help="config.toml path")
    p.add_argument("--host")
    p.add_argument("--port", type=int)
    p.add_argument("--public-url", help="URL clients reach this daemon at (required behind a proxy)")
    p.add_argument("--allow-origin", action="append", help="origin of a separately hosted app (repeatable)")
    p.add_argument("--no-ui", action="store_true", help="do not serve the bundled web app")
    p.add_argument("--dev", action="store_true", help="state in ./.dev-state, auto-reload")
    return p


def main(argv: list[str] | None = None) -> None:
    args = _parser().parse_args(argv)
    overrides = {
        "host": args.host,
        "port": args.port,
        "public_url": args.public_url,
        "cors.allowed_origins": args.allow_origin,
        "serve_ui": False if args.no_ui else None,
        "state_dir": Path(".dev-state").resolve() if args.dev else None,
    }
    settings = load_settings(config_file=args.config, overrides=overrides)

    if args.command == "export-openapi":
        app = create_app(settings.model_copy(update={"serve_ui": False}))
        json.dump(app.openapi(), sys.stdout, indent=2, sort_keys=True)
        sys.stdout.write("\n")
        return

    logging.getLogger("uvicorn.access").addFilter(RedactTokenFilter())
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port, proxy_headers=True)
