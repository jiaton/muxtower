"""Claude Code's hooks: a `--settings` file whose command hooks run `relay.py` for every event, which posts
it to the daemon. Not http hooks: Claude Code tells the agent about each one that fails ("PostToolUse:Bash
hook error … ECONNREFUSED" while the daemon restarts), and the agent took muxtower for gone; the relay tries
again and otherwise says nothing. Nothing is written to the user's own settings.json."""

import json
from typing import Any

from pydantic import ValidationError

from muxtower.hooks.events import AskingTools, HookEvent
from muxtower.hooks.ports import MCP_SERVER, HookLaunch
from muxtower.hooks.relay import relay_command, write_target

EVENTS = [
    "SessionStart",
    "SessionEnd",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "PermissionRequest",
    "PermissionDenied",
    "Notification",
    "Stop",
    "StopFailure",
]


def hook_settings(command: str) -> dict[str, Any]:
    hook = {"type": "command", "command": command, "timeout": 5}
    return {"hooks": {event: [{"hooks": [hook]}] for event in EVENTS}}


class ClaudeCodeHooks:
    name = "claude-code"
    asking = AskingTools(questions=frozenset({"AskUserQuestion"}), plans=frozenset({"ExitPlanMode"}))

    def launch_args(self, launch: HookLaunch) -> list[str]:
        settings = launch.files / f"{launch.session_id}.json"
        settings.parent.mkdir(parents=True, exist_ok=True)
        target = write_target(
            launch.files / f"{launch.session_id}.relay.json", launch.url, launch.session_id, launch.token
        )
        settings.write_text(json.dumps(hook_settings(relay_command(target))))
        args = ["--settings", str(settings)]
        if launch.mcp_url:
            server = {"type": "http", "url": launch.mcp_url, "headers": {"Authorization": f"Bearer {launch.mcp_token}"}}
            config = launch.files / f"{launch.session_id}.mcp.json"
            config.touch(mode=0o600)
            config.chmod(0o600)
            config.write_text(json.dumps({"mcpServers": {MCP_SERVER: server}}))
            args += ["--mcp-config", str(config)]
        return args

    def event(self, body: bytes) -> HookEvent:
        try:
            return HookEvent.model_validate_json(body)
        except ValidationError as exc:
            raise ValueError("not a Claude Code hook event") from exc
