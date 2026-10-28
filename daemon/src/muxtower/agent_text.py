"""Turning agent tool calls and long text into the short lines a phone or glasses can show."""

import json
from typing import Any

from muxtower.runtimes.models import PendingQuestion, QuestionOption

DETAIL_LIMIT = 4000


def truncate(text: str) -> str:
    return text if len(text) <= DETAIL_LIMIT else text[:DETAIL_LIMIT] + "…"


def tool_description(tool_input: Any) -> str | None:
    """What the agent said a tool call does, when it said (Claude Code's Bash and Task take one)."""
    value = tool_input.get("description") if isinstance(tool_input, dict) else None
    return (value.strip()[:200] or None) if isinstance(value, str) else None


def describe_tool_input(tool_input: Any) -> str | None:
    """The one thing a human needs to judge a tool call: the command, the path, the URL…"""
    if not isinstance(tool_input, dict):
        return None
    for key in ("command", "cmd", "file_path", "path", "url", "pattern", "query", "prompt", "plan"):
        value = tool_input.get(key)
        if isinstance(value, str) and value:
            return truncate(value)
    questions = tool_input.get("questions")
    if isinstance(questions, list):
        texts = [q.get("question", "") for q in questions if isinstance(q, dict)]
        return truncate("\n".join(t for t in texts if t)) or None
    return truncate(json.dumps(tool_input, ensure_ascii=False, indent=1)) if tool_input else None


def questions_of(tool_input: Any) -> list[PendingQuestion]:
    """The questions of a multiple-choice prompt (AskUserQuestion's input), each with its options."""
    raw = tool_input.get("questions") if isinstance(tool_input, dict) else None
    found = []
    for q in raw if isinstance(raw, list) else []:
        options = [
            QuestionOption(label=str(o["label"]), description=str(o["description"]) if o.get("description") else None)
            for o in q.get("options") or [] if isinstance(o, dict) and o.get("label")
        ] if isinstance(q, dict) else []  # fmt: skip
        if options and q.get("question"):
            found.append(PendingQuestion(
                question=str(q["question"]), header=str(q["header"]) if q.get("header") else None,
                multi_select=bool(q.get("multiSelect")), options=options,
            ))  # fmt: skip
    return found
