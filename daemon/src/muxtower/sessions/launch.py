"""How a session is started: in the permission mode asked for (else the configured default, else the
agent's own settings: nothing added), with the configured default arguments, then what was asked for.

An agent starting a session (MCP `start_session`) may ask for a mode only up to the configured default
(or the agent's usual one), and never a dangerous one (no asking, or no sandbox) unless the owner allowed
it (`launch.agents_may_escalate`): otherwise an agent kept to asking could start one that is not."""

from muxtower.errors import Forbidden, Invalid
from muxtower.runtimes.spec import PermissionMode, RuntimeConfig

AGENTS_OWN = "agent"  # no flag: the agent's own settings decide


def find(config: RuntimeConfig, mode: str | None) -> PermissionMode | None:
    if not mode or mode == AGENTS_OWN:
        return None
    found = next((m for m in config.permission_modes if m.id == mode), None)
    if found is None:
        known = ", ".join(m.id for m in config.permission_modes) or "none"
        raise Invalid(f"{config.name} has no permission mode {mode!r} (it has: {known})")
    return found


def launch_args(config: RuntimeConfig, mode: str | None, defaults: list[str], extra: list[str]) -> list[str]:
    chosen = find(config, mode)
    return [*(chosen.args if chosen else []), *defaults, *extra]


def mode_of(args: list[str] | None, config: RuntimeConfig) -> str | None:
    """The permission mode a session was started in, read back from its arguments."""
    for mode in config.permission_modes:
        n = len(mode.args)
        if any((args or [])[i : i + n] == mode.args for i in range(len(args or []) - n + 1)):
            return mode.id
    return None


def _rank(config: RuntimeConfig, mode: str | None) -> int:
    ids = [m.id for m in config.permission_modes]
    if mode and mode != AGENTS_OWN and mode in ids:
        return ids.index(mode)
    usual = next((i for i, m in enumerate(config.permission_modes) if m.usual), 0)
    return usual


def agent_may_ask(config: RuntimeConfig, mode: str | None, default: str | None, may_escalate: bool) -> None:
    """Raises Forbidden when an agent asks for more than the owner set up (`agents_may_escalate`)."""
    chosen = find(config, mode)
    if chosen is None or may_escalate:
        return
    if chosen.dangerous:
        raise Forbidden(
            f"an agent cannot start a session in {chosen.id} (the owner's to choose: launch.agents_may_escalate)"
        )
    if _rank(config, mode) > _rank(config, default):
        raise Forbidden(
            f"an agent cannot start a session above the default mode ({default or AGENTS_OWN}) in {chosen.id}"
        )
