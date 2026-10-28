"""Codex's hooks: command hooks, given on its command line (`-c hooks={…}`), that
run `relay.py` for every event; the relay posts the event, which Codex hands it on stdin, to the daemon.

Command hooks rather than the environment: Codex starts a hook with the session's environment minus the
variables it keeps from tools, so the relay reads where to post and the session's token from a file of
its own (0600, next to the session's other hook files), named on its command line.

Trust: Codex runs a hook someone added only once the owner has trusted it, keyed by where it is declared
and a hash of what it runs, and asks at startup otherwise. Hooks given on the command line are trusted on
the command line too (`hooks.state`, which Codex reads from the user's config and from the command line
only), so muxtower trusts exactly the hooks it adds, for the session it starts, and writes nothing into
`~/.codex`. Should a Codex version hash them differently, the session asks at startup ("Hooks need
review", a screen rule), and nothing runs untrusted."""

import hashlib
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from muxtower.hooks.events import AskingTools, HookEvent
from muxtower.hooks.ports import HookLaunch

RELAY = Path(__file__).with_name("relay.py")
TIMEOUT_SECONDS = 3  # the most Codex allows a SessionEnd or Interrupt hook; it hashes the clamped value
# Event -> the label Codex keys its hook state with.
EVENTS = {
    "SessionStart": "session_start",
    "SessionEnd": "session_end",
    "UserPromptSubmit": "user_prompt_submit",
    "PreToolUse": "pre_tool_use",
    "PostToolUse": "post_tool_use",
    "PermissionRequest": "permission_request",
    "Stop": "stop",
    "Interrupt": "interrupt",  # not in older versions
}
# Where Codex says hooks from the command line are declared.
SESSION_FLAGS = r"C:\<session-flags>\config.toml" if os.name == "nt" else "/<session-flags>/config.toml"


def relay_command(target: Path) -> str:
    """Runs the relay with this daemon's Python, isolated and without site-packages: standard library only."""
    argv = [sys.executable, "-I", "-S", str(RELAY), str(target)]
    return subprocess.list2cmdline(argv) if os.name == "nt" else shlex.join(argv)


def handler(command: str) -> dict[str, Any]:
    """As Codex normalizes it: the defaults it fills in, nothing unset."""
    return {"type": "command", "command": command, "timeout": TIMEOUT_SECONDS, "async": False}


def trusted_hash(label: str, hook: dict[str, Any]) -> str:
    """Codex's trust hash of one hook: SHA-256 of the sorted, compact JSON of what it declares."""
    identity = {"event_name": label, "hooks": [hook]}
    canonical = json.dumps(identity, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return "sha256:" + hashlib.sha256(canonical.encode()).hexdigest()


def toml(value: Any) -> str:
    """One TOML value on one line (inline tables), as `codex -c key=value` takes it."""
    if isinstance(value, dict):
        return "{" + ", ".join(f"{json.dumps(k)} = {toml(v)}" for k, v in value.items()) + "}"
    if isinstance(value, list):
        return "[" + ", ".join(toml(v) for v in value) + "]"
    return json.dumps(value, ensure_ascii=False)  # strings, numbers and booleans read the same in TOML


def hooks_config(command: str) -> dict[str, Any]:
    """The `hooks` table: every event runs the relay, and each of those hooks is trusted."""
    hook = handler(command)
    config: dict[str, Any] = {event: [{"hooks": [hook]}] for event in EVENTS}
    config["state"] = {
        f"{SESSION_FLAGS}:{label}:0:0": {"trusted_hash": trusted_hash(label, hook)} for label in EVENTS.values()
    }
    return config


class CodexHooks:
    name = "codex"
    asking = AskingTools(questions=frozenset({"request_user_input"}))  # Plan mode's questions, with the options

    def launch_args(self, launch: HookLaunch) -> list[str]:
        target = launch.files / f"{launch.session_id}.codex.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.touch(mode=0o600)
        target.chmod(0o600)
        target.write_text(json.dumps({"url": launch.url, "session": launch.session_id, "token": launch.token}))
        return ["-c", f"hooks={toml(hooks_config(relay_command(target)))}"]

    def event(self, body: bytes) -> HookEvent:
        try:
            return HookEvent.model_validate_json(body)
        except ValidationError as exc:
            raise ValueError("not a Codex hook event") from exc
