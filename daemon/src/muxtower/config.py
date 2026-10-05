"""Daemon settings: defaults < config.toml < MUXTOWER_* environment variables < CLI flags."""

import os
import tomllib
from enum import StrEnum
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


def _xdg(var: str, fallback: str) -> Path:
    return Path(os.environ.get(var) or Path.home() / fallback) / "muxtower"


DEFAULT_CONFIG_DIR = _xdg("XDG_CONFIG_HOME", ".config")
DEFAULT_STATE_DIR = _xdg("XDG_STATE_HOME", ".local/state")


class PairingMode(StrEnum):
    DEVICE = "device"  # each claim mints a new named device token
    SHARED = "shared"  # each claim hands out one existing token (for gates that must know every token)


class CorsSettings(BaseModel):
    allowed_origins: list[str] = Field(default_factory=list)


class PairingSettings(BaseModel):
    mode: PairingMode = PairingMode.DEVICE
    shared_token_name: str | None = None
    window_seconds: int = 600


class Settings(BaseModel):
    host: str = "127.0.0.1"
    port: int = 8731
    # What pairing links and the bundled /config.json advertise. Required behind a reverse proxy.
    public_url: str | None = None
    state_dir: Path = DEFAULT_STATE_DIR
    config_dir: Path = DEFAULT_CONFIG_DIR
    serve_ui: bool = True
    tmux_socket: str = "muxtower"
    cors: CorsSettings = Field(default_factory=CorsSettings)
    pairing: PairingSettings = Field(default_factory=PairingSettings)

    @property
    def db_path(self) -> Path:
        return self.state_dir / "muxtower.db"


# Flat env var -> nested settings key. Lists are comma-separated.
_ENV_KEYS: dict[str, tuple[str, ...]] = {
    "MUXTOWER_HOST": ("host",),
    "MUXTOWER_PORT": ("port",),
    "MUXTOWER_PUBLIC_URL": ("public_url",),
    "MUXTOWER_STATE_DIR": ("state_dir",),
    "MUXTOWER_SERVE_UI": ("serve_ui",),
    "MUXTOWER_TMUX_SOCKET": ("tmux_socket",),
    "MUXTOWER_CORS_ALLOWED_ORIGINS": ("cors", "allowed_origins"),
    "MUXTOWER_PAIRING_MODE": ("pairing", "mode"),
    "MUXTOWER_PAIRING_SHARED_TOKEN_NAME": ("pairing", "shared_token_name"),
}


def _set_nested(data: dict[str, Any], keys: tuple[str, ...], value: Any) -> None:
    for key in keys[:-1]:
        data = data.setdefault(key, {})
    data[keys[-1]] = value


def load_settings(
    config_file: Path | None = None,
    env: dict[str, str] | None = None,
    overrides: dict[str, Any] | None = None,
) -> Settings:
    env = dict(os.environ) if env is None else env
    config_file = config_file or Path(env.get("MUXTOWER_CONFIG") or DEFAULT_CONFIG_DIR / "config.toml")

    data: dict[str, Any] = {}
    if config_file.exists():
        data = tomllib.loads(config_file.read_text())

    for var, keys in _ENV_KEYS.items():
        if var in env:
            raw = env[var]
            value: Any = (
                [o.strip() for o in raw.split(",") if o.strip()] if keys[-1] == "allowed_origins" else raw
            )
            _set_nested(data, keys, value)

    for dotted, value in (overrides or {}).items():
        if value is not None:
            _set_nested(data, tuple(dotted.split(".")), value)

    return Settings.model_validate(data)
