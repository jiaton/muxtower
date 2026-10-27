"""The harnesses whose hooks muxtower wires up, by the name a runtime gives in `hooks`. A new one is a
module with a `HookHarness` (ports.py), listed here."""

from muxtower.hooks.claude_code import ClaudeCodeHooks
from muxtower.hooks.codex import CodexHooks
from muxtower.hooks.ports import HookHarness

HARNESSES: dict[str, HookHarness] = {h.name: h for h in (ClaudeCodeHooks(), CodexHooks())}


def harness(name: str | None) -> HookHarness | None:
    return HARNESSES.get(name) if name else None
