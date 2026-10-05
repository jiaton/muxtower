"""`muxtower`: the local CLI. Talks to the state directory directly, so it needs local access."""

import argparse
import sys

from muxtower.app import build_token_service
from muxtower.auth.service import TokenNameTaken
from muxtower.config import load_settings


def _cmd_token(args: argparse.Namespace) -> int:
    tokens = build_token_service(load_settings())
    if args.action == "add":
        try:
            device, token = tokens.create(args.name)
        except TokenNameTaken:
            print(f"a token named {args.name!r} already exists", file=sys.stderr)
            return 1
        print(f"created token {device.name!r}; it is shown only once:\n{token}")
    elif args.action == "list":
        for t in tokens.list():
            print(f"{t.name}\tcreated {t.created_at:%Y-%m-%d}\tlast used {t.last_used_at or 'never'}")
    elif args.action == "revoke":
        if not tokens.revoke(args.name):
            print(f"no token named {args.name!r}", file=sys.stderr)
            return 1
        print(f"revoked {args.name!r}")
    return 0


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="muxtower", description="Run and control coding agents in tmux")
    sub = p.add_subparsers(dest="command", required=True)

    token = sub.add_parser("token", help="manage device tokens")
    token_sub = token.add_subparsers(dest="action", required=True)
    token_sub.add_parser("add", help="mint a new token").add_argument("name")
    token_sub.add_parser("list", help="list tokens")
    token_sub.add_parser("revoke", help="revoke a token").add_argument("name")
    token.set_defaults(func=_cmd_token)

    args = p.parse_args(argv)
    sys.exit(args.func(args))
