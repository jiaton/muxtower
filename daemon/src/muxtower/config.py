"""Daemon settings: defaults < config.toml < MUXTOWER_* environment variables < CLI flags."""

import os
import tomllib
from enum import StrEnum
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field


def _xdg(var: str, fallback: str) -> Path:
    return Path(os.environ.get(var) or Path.home() / fallback) / "muxtower"


DEFAULT_CONFIG_DIR = _xdg("XDG_CONFIG_HOME", ".config")
DEFAULT_STATE_DIR = _xdg("XDG_STATE_HOME", ".local/state")


class PairingMode(StrEnum):
    DEVICE = "device"  # each claim mints a new named device token
    SHARED = "shared"  # each claim hands out one existing token (for gates that must know every token)


class CorsSettings(BaseModel):
    # "*" is safe as the default because auth is bearer-only: no cookies ride along, so a foreign page
    # gets nothing without a token. List origins here only to tighten it.
    allowed_origins: list[str] = Field(default_factory=lambda: ["*"])
    # Request headers clients may add besides Authorization and Content-Type: a gate's own credential
    # header, sent by apps that run off the daemon's origin (e.g. a packaged glasses app).
    extra_headers: list[str] = Field(default_factory=list)


class PairingSettings(BaseModel):
    mode: PairingMode = PairingMode.DEVICE
    # Shared mode: the token value every claim hands out (it is also accepted as a device named "shared").
    shared_token: str | None = None
    code_ttl_seconds: int = 300


class RemoteControlSettings(BaseModel):
    """Claude Code Remote Control sessions of the Claude account logged in on this machine (private API)."""

    enabled: bool = False
    poll_seconds: float = 5.0
    # environment_id -> the name to show ("build-box", "laptop"); the API does not expose machine names.
    environments: dict[str, str] = Field(default_factory=dict)
    credentials_path: Path | None = None  # default ~/.claude/.credentials.json
    config_path: Path | None = None  # default ~/.claude.json


class CodexSettings(BaseModel):
    """Codex beyond the terminal: `headless` runs Codex threads in muxtower's own Codex app-server (no
    tmux), started from the app and answered from it, with the Codex login on this machine; `shared` joins
    the app-server Codex's own clients share."""

    headless: bool = False
    # Also list, drive and approve the threads of the Codex app-server this machine's own Codex clients share
    # (a `codex` in a terminal, the desktop app, an editor), as Remote Control does for Claude Code. muxtower
    # only joins it while it runs; it never starts it.
    shared: bool = False
    binary: str = "codex"
    # How a headless thread runs. Codex's own sandbox needs user namespaces: on a machine (or container)
    # that has none every command fails inside it and is then offered again "without the sandbox", so
    # there "danger-full-access" with approvals on ("on-request") asks once instead of twice.
    sandbox: Literal["read-only", "workspace-write", "danger-full-access"] = "workspace-write"
    approval_policy: Literal["untrusted", "on-request", "never"] = "on-request"
    model: str | None = None  # Codex's own default when unset


class SummarySettings(BaseModel):
    """Short versions of long replies (for the glasses), made by a coding agent CLI already logged in on
    this machine: "claude-code" (`claude -p`, default model haiku) or "codex" (`codex exec`)."""

    provider: Literal["off", "claude-code", "codex"] = "off"
    model: str | None = None
    binary: str | None = None
    min_chars: int = 400  # replies up to this long are shown as they are
    eager: bool = True  # also summarize as soon as a session starts needing the owner
    timeout_seconds: float = 120


class AsrSettings(BaseModel):
    """Speech to text for voice replies, through Groq or OpenAI (OpenAI-compatible API)."""

    provider: Literal["off", "groq", "openai"] = "off"
    api_key: str | None = None  # or api_key_file; env MUXTOWER_ASR_API_KEY
    api_key_file: Path | None = None
    model: str | None = None  # groq: whisper-large-v3-turbo, openai: gpt-4o-transcribe
    language: str | None = None  # pin e.g. "zh"; empty = detect per recording
    prompt: str | None = None  # extra words the recognizer should know (names, jargon)

    def key(self) -> str | None:
        if self.api_key:
            return self.api_key
        if self.api_key_file and self.api_key_file.expanduser().is_file():
            return self.api_key_file.expanduser().read_text().strip() or None
        return None


class ConciergeSettings(BaseModel):
    """An assistant: a Claude Code session muxtower keeps running, which the owner talks to instead of
    each session. It reaches the other sessions through muxtower's MCP tools (/v1/mcp)."""

    enabled: bool = False
    name: str = "Assistant"
    model: str = "sonnet"
    cwd: Path = Path("~")
    remote_control: bool = True  # also reachable from the Claude apps
    args: list[str] = Field(default_factory=list)  # extra `claude` arguments, e.g. a permission mode


class HubSettings(BaseModel):
    """This daemon as a node of a hub (`muxtower pair --join`). Which hub it joined is kept in the state
    directory; only what to send along lives here."""

    # Headers sent with every request to the hub, for a gate in front of it, e.g. {"X-Gate-Token" = "…"}.
    headers: dict[str, str] = Field(default_factory=dict)
    # Installing the hub's version from PyPI (`nodes/update.py`): "incompatible" when the hub no longer
    # speaks this node's protocol, "always" whenever it runs a later one, "never" (only told).
    update: Literal["always", "incompatible", "never"] = "incompatible"


class RecoverySettings(BaseModel):
    """Sessions whose machine restarted under them (`recovery/`): ask the owner which to start again
    (default), start them all again (auto), or let them go (off)."""

    mode: Literal["ask", "auto", "off"] = "ask"


class UsageSettings(BaseModel):
    """When what the daemon uses is worth showing (an alert by the machine's name in the app)."""

    cpu_percent: float = 20.0  # of one core, over the last minute
    tick_ms: float = 200.0  # the capture loop's ticks, on average over the last minute
    rss_mb: float = 500.0


class Settings(BaseModel):
    name: str | None = None  # display name in the app; defaults to the hostname
    host: str = "127.0.0.1"
    port: int = 8731
    # What pairing links and the bundled /config.json advertise. Required behind a reverse proxy.
    public_url: str | None = None
    # Who push services may contact about this daemon's notifications (VAPID `sub`): a mailto: or https:
    # address. Defaults to public_url; Apple refuses every push signed with a made-up one.
    push_contact: str | None = Field(default=None, pattern=r"^(mailto:|https://)")
    state_dir: Path = DEFAULT_STATE_DIR
    config_dir: Path = DEFAULT_CONFIG_DIR
    serve_ui: bool = True
    tmux_socket: str = "muxtower"
    # Other tmux servers to scan for agents started outside muxtower ("default" = the user's own tmux).
    adopt_sockets: list[str] = Field(default_factory=lambda: ["default"])
    tick_seconds: float = 1.0
    # Proxies whose X-Forwarded-For is believed (CIDRs), e.g. a reverse proxy's docker network. Used to
    # find the real client for rate limits; never needed when clients connect directly.
    trusted_proxies: list[str] = Field(default_factory=lambda: ["127.0.0.1/32", "::1/128"])
    cors: CorsSettings = Field(default_factory=CorsSettings)
    pairing: PairingSettings = Field(default_factory=PairingSettings)
    remote_control: RemoteControlSettings = Field(default_factory=RemoteControlSettings)
    codex: CodexSettings = Field(default_factory=CodexSettings)
    summaries: SummarySettings = Field(default_factory=SummarySettings)
    asr: AsrSettings = Field(default_factory=AsrSettings)
    concierge: ConciergeSettings = Field(default_factory=ConciergeSettings)
    usage: UsageSettings = Field(default_factory=UsageSettings)
    recovery: RecoverySettings = Field(default_factory=RecoverySettings)
    hub: HubSettings = Field(default_factory=HubSettings)

    @property
    def db_path(self) -> Path:
        return self.state_dir / "muxtower.db"

    @property
    def local_url(self) -> str:
        """How processes on this machine (hooks, the CLI) reach the daemon."""
        host = "127.0.0.1" if self.host in ("0.0.0.0", "::", "") else self.host  # noqa: S104
        return f"http://{host}:{self.port}"


# Flat env var -> nested settings key. Lists are comma-separated.
_ENV_KEYS: dict[str, tuple[str, ...]] = {
    "MUXTOWER_NAME": ("name",),
    "MUXTOWER_HOST": ("host",),
    "MUXTOWER_PORT": ("port",),
    "MUXTOWER_PUBLIC_URL": ("public_url",),
    "MUXTOWER_PUSH_CONTACT": ("push_contact",),
    "MUXTOWER_STATE_DIR": ("state_dir",),
    "MUXTOWER_SERVE_UI": ("serve_ui",),
    "MUXTOWER_TMUX_SOCKET": ("tmux_socket",),
    "MUXTOWER_CORS_ALLOWED_ORIGINS": ("cors", "allowed_origins"),
    "MUXTOWER_PAIRING_MODE": ("pairing", "mode"),
    "MUXTOWER_PAIRING_SHARED_TOKEN": ("pairing", "shared_token"),
    "MUXTOWER_ADOPT_SOCKETS": ("adopt_sockets",),
    "MUXTOWER_TRUSTED_PROXIES": ("trusted_proxies",),
    "MUXTOWER_REMOTE_CONTROL_ENABLED": ("remote_control", "enabled"),
    "MUXTOWER_SUMMARIES_PROVIDER": ("summaries", "provider"),
    "MUXTOWER_ASR_PROVIDER": ("asr", "provider"),
    "MUXTOWER_ASR_API_KEY": ("asr", "api_key"),
    "MUXTOWER_CONCIERGE_ENABLED": ("concierge", "enabled"),
}


_LIST_KEYS = {"allowed_origins", "adopt_sockets", "trusted_proxies"}


def _set_nested(data: dict[str, Any], keys: tuple[str, ...], value: Any) -> None:
    for key in keys[:-1]:
        data = data.setdefault(key, {})
    data[keys[-1]] = value


def config_path(env: dict[str, str] | None = None) -> Path:
    """The config file: $MUXTOWER_CONFIG, else config.toml in the config directory."""
    env = dict(os.environ) if env is None else env
    return Path(env.get("MUXTOWER_CONFIG") or DEFAULT_CONFIG_DIR / "config.toml")


def load_settings(
    config_file: Path | None = None,
    env: dict[str, str] | None = None,
    overrides: dict[str, Any] | None = None,
) -> Settings:
    env = dict(os.environ) if env is None else env
    config_file = config_file or config_path(env)

    data: dict[str, Any] = {}
    if config_file.exists():
        data = tomllib.loads(config_file.read_text())

    for var, keys in _ENV_KEYS.items():
        if var in env:
            raw = env[var]
            value: Any = [o.strip() for o in raw.split(",") if o.strip()] if keys[-1] in _LIST_KEYS else raw
            _set_nested(data, keys, value)

    for dotted, value in (overrides or {}).items():
        if value is not None:
            _set_nested(data, tuple(dotted.split(".")), value)

    return Settings.model_validate(data)
