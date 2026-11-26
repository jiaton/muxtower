"""The sign-ins of this machine's Claude Code and Codex CLIs, read from their own files into memory on every poll.

Only what plan usage needs is kept, and only for the poll: the access token (never the refresh token, which this
never uses: Claude's rotates, so a refresh here would sign Claude Code out), when it expires, the plan, and Codex's
account id. Names and addresses in those files are not read."""

import base64
import json
import os
from collections.abc import Mapping
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from muxtower.subscriptions.ports import ClaudeLogin, CodexLogin, Secret


class Unreadable(Exception):
    """The file is there but not readable now (half written, say): keep what was read before."""


def _load(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (OSError, ValueError) as exc:
        raise Unreadable(f"{path.name}: {type(exc).__name__}") from None  # never its text: it holds tokens


def _text(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def jwt_claims(token: str) -> dict[str, Any]:
    """A JWT's claims, read without checking it (only to know when it expires); {} when unreadable."""
    try:
        part = token.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
    except (IndexError, ValueError):
        return {}
    return claims if isinstance(claims, dict) else {}


class CliLogins:
    def __init__(self, home: Path, env: Mapping[str, str] = os.environ) -> None:
        self.home = home
        self.env = env

    def claude(self) -> ClaudeLogin | None:
        folder = Path(self.env["CLAUDE_CONFIG_DIR"]) if self.env.get("CLAUDE_CONFIG_DIR") else self.home / ".claude"
        data = _load(folder / ".credentials.json")
        oauth = data.get("claudeAiOauth") if isinstance(data, dict) else None
        token = _text(oauth.get("accessToken")) if isinstance(oauth, dict) else None
        if not isinstance(oauth, dict) or token is None:
            return None
        expires = oauth.get("expiresAt")
        expires_at = (
            datetime.fromtimestamp(expires / 1000, UTC) if isinstance(expires, int | float) and expires > 0 else None
        )
        return ClaudeLogin(Secret(token), expires_at, _text(oauth.get("subscriptionType")))

    def codex(self) -> CodexLogin | None:
        folder = Path(self.env["CODEX_HOME"]) if self.env.get("CODEX_HOME") else self.home / ".codex"
        data = _load(folder / "auth.json")
        tokens = data.get("tokens") if isinstance(data, dict) else None
        if not isinstance(tokens, dict):
            return None  # signed in with an API key: no plan
        token, account = _text(tokens.get("access_token")), _text(tokens.get("account_id"))
        if token is None or account is None:
            return None
        claims = jwt_claims(token)
        exp = claims.get("exp")
        auth = claims.get("https://api.openai.com/auth")
        plan = _text(auth.get("chatgpt_plan_type")) if isinstance(auth, dict) else None
        expires_at = datetime.fromtimestamp(exp, UTC) if isinstance(exp, int | float) and exp > 0 else None
        return CodexLogin(Secret(token), expires_at, account, plan)
