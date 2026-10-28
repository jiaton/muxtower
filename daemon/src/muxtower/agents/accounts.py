"""The account each agent on this machine runs as, so sessions of different accounts can be told apart
(two Claude accounts, Claude Code with an API key, Codex). Read from the agents' own login files, for
who is logged in only: no token is kept, logged or sent anywhere. Re-read when a file changes.

Claude Code (and its Remote Control sessions): `~/.claude.json` names the claude.ai account it signed in
with; without one, an API key (`ANTHROPIC_API_KEY`) is "API key". Codex: `~/.codex/auth.json` holds a
ChatGPT sign-in, whose ID token names its email, or an API key."""

import base64
import json
import os
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

from muxtower.sessions.models import Session
from muxtower.sessions.ports import SessionSource

API_KEY = "API key"


def _jwt_email(token: Any) -> str | None:
    """The email claim of an ID token, read for display only (it is the agent's own; not verified)."""
    if not isinstance(token, str) or token.count(".") != 2:
        return None
    payload = token.split(".")[1]
    try:
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except ValueError:
        return None
    email = claims.get("email") if isinstance(claims, dict) else None
    return email if isinstance(email, str) and email else None


class _Cached:
    """A value read from a file, again only when the file changed."""

    def __init__(self, path: Path, read: Callable[[dict[str, Any]], str | None]) -> None:
        self.path = path
        self.read = read
        self._stamp: float | None = None
        self._value: str | None = None

    def get(self) -> str | None:
        try:
            stamp = self.path.stat().st_mtime
        except OSError:
            return None
        if stamp != self._stamp:
            try:
                data = json.loads(self.path.read_text())
                self._value = self.read(data) if isinstance(data, dict) else None
            except (OSError, ValueError):
                self._value = None
            self._stamp = stamp
        return self._value


class Accounts:
    def __init__(self, home: Path | None = None, env: Mapping[str, str] | None = None) -> None:
        home = home or Path.home()
        self.env = os.environ if env is None else env
        claude_dir, codex_dir = self.env.get("CLAUDE_CONFIG_DIR"), self.env.get("CODEX_HOME")
        self._claude = _Cached(
            Path(claude_dir) / ".claude.json" if claude_dir else home / ".claude.json", self._claude_account
        )
        self._codex = _Cached(
            Path(codex_dir) / "auth.json" if codex_dir else home / ".codex" / "auth.json", self._codex_account
        )

    @staticmethod
    def _claude_account(data: dict[str, Any]) -> str | None:
        account = data.get("oauthAccount")
        email = account.get("emailAddress") if isinstance(account, dict) else None
        return email if isinstance(email, str) and email else None

    @staticmethod
    def _codex_account(data: dict[str, Any]) -> str | None:
        tokens = data.get("tokens")
        if data.get("auth_mode") != "apikey" and isinstance(tokens, dict):
            if email := _jwt_email(tokens.get("id_token")):
                return email
        return API_KEY if data.get("OPENAI_API_KEY") else None

    def claude(self) -> str | None:
        return self._claude.get() or (API_KEY if self.env.get("ANTHROPIC_API_KEY") else None)

    def codex(self) -> str | None:
        return self._codex.get()

    def __call__(self, session: Session) -> str | None:
        if session.runtime == "codex" or session.source in (SessionSource.CODEX, SessionSource.CODEX_SHARED):
            return self.codex()
        if session.runtime.startswith("claude") or session.source == SessionSource.REMOTE_CONTROL:
            return self.claude()
        return None
