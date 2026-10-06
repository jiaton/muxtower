"""`muxtower serve` (run the daemon in the foreground) and `muxtower openapi` (print the API contract)."""

import argparse
import json
import logging
import re
import sys
from pathlib import Path

import uvicorn

from muxtower.app import create_app
from muxtower.config import Settings, load_settings


class RedactTokenFilter(logging.Filter):
    """Access log lines include the request path; strip `?token=` so tokens never reach a log."""

    _pattern = re.compile(r"([?&]token=)[^&\s\"]+")

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple):
            record.args = tuple(
                self._pattern.sub(r"\1[redacted]", a) if isinstance(a, str) else a for a in record.args
            )
        return True


def add_serve_parser(sub: "argparse._SubParsersAction[argparse.ArgumentParser]") -> None:
    p = sub.add_parser("serve", help="run the daemon in the foreground")
    p.add_argument("--config", type=Path, help="config.toml path")
    p.add_argument("--host", help="bind address (default 127.0.0.1)")
    p.add_argument("--port", type=int, help="port (default 8731)")
    p.add_argument("--public-url", help="https URL clients reach this daemon at (behind a proxy or tunnel)")
    p.add_argument("--allow-origin", action="append", help="origin of a separately hosted app (repeatable)")
    p.add_argument("--no-ui", action="store_true", help="do not serve the bundled web app")
    p.add_argument("--dev", action="store_true", help="keep state in ./.dev-state")
    p.set_defaults(func=cmd_serve)

    o = sub.add_parser("openapi", help="print the API's OpenAPI schema")
    o.set_defaults(func=cmd_openapi)


def _settings(args: argparse.Namespace) -> Settings:
    overrides = {
        "host": args.host,
        "port": args.port,
        "public_url": args.public_url,
        "cors.allowed_origins": args.allow_origin,
        "serve_ui": False if args.no_ui else None,
        "state_dir": Path(".dev-state").resolve() if args.dev else None,
    }
    return load_settings(config_file=args.config, overrides=overrides)


def cmd_serve(args: argparse.Namespace) -> int:
    settings = _settings(args)
    logging.getLogger("uvicorn.access").addFilter(RedactTokenFilter())
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port, proxy_headers=True)
    return 0


def cmd_openapi(args: argparse.Namespace) -> int:
    app = create_app(load_settings().model_copy(update={"serve_ui": False}))
    json.dump(app.openapi(), sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    return 0
