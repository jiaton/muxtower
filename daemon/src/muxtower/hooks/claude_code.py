"""Claude Code's hooks: a `--settings` file whose http hooks post every event to the daemon, with the
session's id and token taken from its environment. Nothing is written to the user's own settings.json."""

import json
from typing import Any

from pydantic import ValidationError

from muxtower.hooks.events import SESSION_HEADER, AskingTools, HookEvent
from muxtower.hooks.ports import HookLaunch

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


def hook_settings(hook_url: str) -> dict[str, Any]:
    hook = {
        "type": "http",
        "url": hook_url,
        "headers": {
            "Authorization": "Bearer ${MUXTOWER_HOOK_TOKEN}",
            SESSION_HEADER: "${MUXTOWER_SESSION_ID}",
        },
        "allowedEnvVars": ["MUXTOWER_HOOK_TOKEN", "MUXTOWER_SESSION_ID"],
        "timeout": 5,
    }
    return {"hooks": {event: [{"hooks": [hook]}] for event in EVENTS}}


class ClaudeCodeHooks:
    name = "claude-code"
    asking = AskingTools(questions=frozenset({"AskUserQuestion"}), plans=frozenset({"ExitPlanMode"}))

    def launch_args(self, launch: HookLaunch) -> list[str]:
        settings = launch.files / f"{launch.session_id}.json"
        settings.parent.mkdir(parents=True, exist_ok=True)
        settings.write_text(json.dumps(hook_settings(launch.url)))
        return ["--settings", str(settings)]

    def event(self, body: bytes) -> HookEvent:
        try:
            return HookEvent.model_validate_json(body)
        except ValidationError as exc:
            raise ValueError("not a Claude Code hook event") from exc
