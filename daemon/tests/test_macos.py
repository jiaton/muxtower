"""What differs on macOS: no /proc (processes come from `ps`), and the Claude login is in the Keychain."""

import json
import os
import subprocess
from pathlib import Path
from typing import Any

import pytest

from muxtower.infra import procfs
from muxtower.sessions.claude_processes import ClaudeProcesses
from muxtower.vendor.claude_rc import credentials


def test_without_proc_children_come_from_ps(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def ps(args: list[str], **_: Any) -> subprocess.CompletedProcess[str]:
        assert args[0] == "ps"
        return subprocess.CompletedProcess(args, 0, stdout="  100     1\n  200   100\n  300     1\n")

    monkeypatch.setattr(procfs.subprocess, "run", ps)
    sessions = tmp_path / "claude" / "sessions"
    sessions.mkdir(parents=True)
    (sessions / "200.json").write_text(json.dumps({"pid": 200, "bridgeSessionId": "session_01MAC"}))
    processes = ClaudeProcesses(tmp_path / "claude", proc=tmp_path / "no-proc")
    assert processes.remote_id(100) == "cse_01MAC" and processes.remote_id(300) is None


def test_a_process_is_alive_without_proc() -> None:
    assert procfs.alive(os.getpid())
    assert not procfs.alive(2**22 + 12345)  # past any pid_max


class FakeSecurity:
    """The `security` CLI over one Keychain item."""

    def __init__(self, item: dict[str, Any] | None) -> None:
        self.item = json.dumps(item) if item else None
        self.commands: list[str] = []

    def __call__(self, args: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        assert args[0] == "security"
        if args[1] == "find-generic-password":
            assert args[args.index("-s") + 1] == credentials.KEYCHAIN_SERVICE
            found = self.item is not None
            return subprocess.CompletedProcess(args, 0 if found else 44, stdout=(self.item or "") + "\n")
        assert args[1:] == ["-i"]  # the secret goes over stdin
        command = kwargs["input"]
        self.commands.append(command)
        self.item = bytes.fromhex(command.rsplit('-X "', 1)[1].split('"')[0]).decode()
        return subprocess.CompletedProcess(args, 0, stdout="")


def test_the_claude_login_is_read_from_and_refreshed_into_the_keychain(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    security = FakeSecurity({"claudeAiOauth": {"accessToken": "old", "refreshToken": "r1", "expiresAt": 1}})
    monkeypatch.setattr(credentials.subprocess, "run", security)
    monkeypatch.setattr(credentials.sys, "platform", "darwin")
    monkeypatch.setattr(credentials, "DEFAULT_CREDENTIALS_PATH", tmp_path / "missing.json")
    monkeypatch.delenv(credentials.ENV_ACCESS_TOKEN, raising=False)
    monkeypatch.delenv(credentials.ENV_CLI_OAUTH_TOKEN, raising=False)

    creds = credentials.load_credentials()
    assert creds.access_token == "old" and creds.keychain and creds.stored and creds.source_path is None

    refreshed = credentials.OAuthCredentials(access_token="new", refresh_token="r2", keychain=True)
    credentials._persist(refreshed)
    assert "new" not in security.commands[0]  # hex, not the token itself
    assert credentials.load_credentials().refresh_token == "r2"

    security.item = None
    with pytest.raises(credentials.CredentialsError, match="Keychain"):
        credentials.load_credentials()
