import base64
import json
import os
from pathlib import Path

from muxtower.agents.accounts import API_KEY, Accounts
from muxtower.sessions.ports import SessionSource
from tests.test_notify_text import session


def _id_token(claims: dict[str, object]) -> str:
    part = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return f"header.{part}.signature"


def test_each_agent_s_account_comes_from_its_own_login(tmp_path: Path) -> None:
    (tmp_path / ".claude.json").write_text(json.dumps({"oauthAccount": {"emailAddress": "me@claude.test"}}))
    (tmp_path / ".codex").mkdir()
    auth = tmp_path / ".codex" / "auth.json"
    signed_in = {"auth_mode": "chatgpt", "tokens": {"id_token": _id_token({"email": "me@openai.test"})}}
    auth.write_text(json.dumps(signed_in))
    accounts = Accounts(tmp_path, env={})
    assert accounts(session(runtime="claude-code")) == "me@claude.test"
    assert accounts(session(runtime="claude-code", source=SessionSource.REMOTE_CONTROL)) == "me@claude.test"
    assert accounts(session(runtime="codex")) == "me@openai.test"
    assert accounts(session(runtime="shell")) is None

    auth.write_text(json.dumps({"auth_mode": "apikey", "OPENAI_API_KEY": "sk-x"}))
    os.utime(auth, (1, 1))  # a different mtime: read again
    assert accounts.codex() == API_KEY


def test_claude_code_with_an_api_key_and_no_login(tmp_path: Path) -> None:
    assert Accounts(tmp_path, env={"ANTHROPIC_API_KEY": "sk-ant"}).claude() == API_KEY
    assert Accounts(tmp_path, env={}).claude() is None
