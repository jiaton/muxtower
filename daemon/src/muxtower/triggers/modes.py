"""The permission mode a trigger's start action starts a session in: `triggers.start_mode` for its runtime,
held to what an agent's start_session may ask (`sessions/launch.py` `agent_may_ask`): above the launch's
default, unless `launch.agents_may_escalate`, it starts in the default instead, and the firing says so."""

from collections.abc import Callable

from pydantic import BaseModel, Field

from muxtower.errors import Forbidden, Invalid
from muxtower.runtimes.spec import RuntimeConfig
from muxtower.sessions.launch import AGENTS_OWN, agent_may_ask


class StartMode(BaseModel):
    runtime: str
    mode: str = Field(description='what a trigger\'s session of this runtime starts in: a mode id, or "agent"')
    label: str = Field(description="the mode as the agent names it")
    configured: str | None = Field(description="triggers.start_mode for this runtime; null: none, the launch default")
    held: str | None = Field(
        default=None, description='why the configured mode is not used: "auto is above it"; it starts in the default'
    )


class StartModes:
    def __init__(
        self, runtimes: Callable[[], dict[str, RuntimeConfig]], configured: Callable[[], dict[str, str]],
        default: Callable[[str], str], may_escalate: Callable[[], bool],
    ) -> None:  # fmt: skip
        self.runtimes = runtimes  # each runtime by name
        self.configured = configured  # `triggers.start_mode`
        self.default = default  # a runtime's launch default (`launch.<runtime>_mode`)
        self.may_escalate = may_escalate  # `launch.agents_may_escalate`

    def all(self) -> list[StartMode]:
        return [self.of(name) for name in self.runtimes()]

    def of(self, runtime: str) -> StartMode:
        runtimes = self.runtimes()
        config = next((c for c in runtimes.values() if runtime in (c.name, c.binary)), None)
        name = config.name if config else runtime
        default = self.default(name)
        configured = self.configured().get(name)
        mode, held = default, None
        if configured is not None and config is not None and configured != default:
            try:
                agent_may_ask(config, configured, default, self.may_escalate())  # start_session's own rule
                mode = configured
            except Forbidden:
                held = f"{configured} is above it"
            except Invalid:
                held = f"{name} has no mode {configured}"
        return StartMode(runtime=name, mode=mode, label=_label(config, mode), configured=configured, held=held)


def _label(config: RuntimeConfig | None, mode: str) -> str:
    found = next((m for m in config.permission_modes if m.id == mode), None) if config else None
    if found is not None:
        return found.label
    return "Its own settings" if mode == AGENTS_OWN else mode
