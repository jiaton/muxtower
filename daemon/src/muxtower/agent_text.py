"""Turning agent tool calls and long text into the short lines a phone or glasses can show."""

import json
from typing import Any

DETAIL_LIMIT = 4000


def truncate(text: str) -> str:
    return text if len(text) <= DETAIL_LIMIT else text[:DETAIL_LIMIT] + "…"


def describe_tool_input(tool_input: Any) -> str | None:
    """The one thing a human needs to judge a tool call: the command, the path, the URL…"""
    if not isinstance(tool_input, dict):
        return None
    for key in ("command", "file_path", "path", "url", "pattern", "query", "prompt", "plan"):
        value = tool_input.get(key)
        if isinstance(value, str) and value:
            return truncate(value)
    questions = tool_input.get("questions")
    if isinstance(questions, list):
        texts = [q.get("question", "") for q in questions if isinstance(q, dict)]
        return truncate("\n".join(t for t in texts if t)) or None
    return truncate(json.dumps(tool_input, ensure_ascii=False, indent=1)) if tool_input else None
