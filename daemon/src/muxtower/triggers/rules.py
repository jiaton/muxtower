"""A trigger's rules on one event's payload: a field by its dotted path, a condition on it, its string form."""

import json
import re
from typing import Any

from muxtower.triggers.models import Condition

MISSING = object()  # no such field (a missing key, an index past the end, a field of a text payload)


def field(payload: Any, path: str) -> Any:
    """The value at a dotted path: dict keys, list indexes as digits. MISSING when it is not there; a text
    (non-JSON) payload has no fields."""
    if isinstance(payload, str):
        return MISSING
    value = payload
    for part in path.split("."):
        if isinstance(value, dict) and part in value:
            value = value[part]
        elif isinstance(value, list) and part.isdigit() and int(part) < len(value):
            value = value[int(part)]
        else:
            return MISSING
    return value


def text_of(value: Any) -> str:
    """A value as a condition compares it: a string as it is, anything else as JSON (10, true, null)."""
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)


def holds(condition: Condition, payload: Any) -> bool:
    value = field(payload, condition.field)
    if value is MISSING:
        return False
    if condition.op == "equals":
        return text_of(value) == condition.value
    if condition.op == "contains":
        if isinstance(value, list):
            return any(text_of(v) == condition.value for v in value)
        return condition.value in text_of(value)
    try:
        return re.search(condition.value, text_of(value)) is not None
    except re.error:
        return False  # the owner's pattern does not compile: it never holds


def failing(conditions: list[Condition], payload: Any) -> Condition | None:
    """The first condition that does not hold (all must), or None."""
    return next((c for c in conditions if not holds(c, payload)), None)
