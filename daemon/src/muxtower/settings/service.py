"""Feature settings changed from the app (`catalog.py`), kept in the database: over the defaults, under
the config file. A key the config file (or the environment) sets is the file's: shown as set there and
not changed here, so the two never disagree.

Stored values are put into the daemon's `Settings` when it starts, before anything reads them; a change
to a `now` setting is also put into the running daemon at once (the services read it each time), one to
a `restart` setting waits for the next start and says so (`pending`)."""

import json
import shlex
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError

from muxtower.config import Settings
from muxtower.errors import Conflict, Invalid
from muxtower.infra.audit import AuditLog
from muxtower.infra.db import Database
from muxtower.settings.catalog import BY_KEY, FIELDS
from muxtower.settings.catalog import Field as CatalogField

Source = Literal["default", "app", "config_file"]


class SettingView(BaseModel):
    key: str = Field(description="dotted, as in the config file: `recovery.mode` is `[recovery] mode`")
    section: str
    label: str
    help: str
    kind: Literal["choice", "bool", "number", "text", "args", "multiline", "per_runtime"]
    choices: list[str]
    runtime_choices: dict[str, list[str]] = Field(
        default_factory=dict, description="per_runtime: each runtime's choices (its permission modes); value maps some"
    )
    value: Any = Field(description="what applies: once the daemon restarts, where `pending`")
    default: Any
    source: Source = Field(description="config_file: set there, and not changed from the app")
    applies: Literal["now", "restart"]
    pending: bool = Field(description="changed since the daemon started: applies when it restarts")
    hub_only: bool = Field(default=False, description="acts only on the hub: a node's settings leave it out")


def _get(settings: Settings, key: str) -> Any:
    table, name = key.split(".")
    return getattr(getattr(settings, table), name)


def _put(settings: Settings, key: str, value: Any) -> None:
    table, name = key.split(".")
    setattr(getattr(settings, table), name, value)


class SettingsService:
    def __init__(
        self, settings: Settings, db: Database, audit: AuditLog | None = None,
        modes: Callable[[], dict[str, list[str]]] = dict,
    ) -> None:  # fmt: skip
        self.settings = settings
        self.modes = modes  # each runtime's permission mode ids, least to most permissive: a per_runtime's choices
        self.db = db
        self.audit = audit or AuditLog(db)
        self.defaults = Settings()
        for key, value in self._stored().items():
            if key in BY_KEY and not self.locked(key):
                try:
                    _put(settings, key, self._valid(key, value))
                except Invalid:
                    pass  # a value this version no longer takes: the default (or the file's) stays
        self.running = {f.key: _get(settings, f.key) for f in FIELDS}  # as the daemon started
        self.listeners: list[Callable[[str, Any], None]] = []  # (key, value now) after a `now` setting changes

    def locked(self, key: str) -> bool:
        return key in self.settings.set_by_file

    def views(self) -> list[SettingView]:
        stored = self._stored()
        return [self._view(f, stored) for f in FIELDS]

    def change(self, values: dict[str, Any], actor: str) -> list[SettingView]:
        """Sets each (None: back to its default), all or none: an unknown key, one the config file sets
        or a value it does not take changes nothing."""
        checked: dict[str, Any] = {}
        for key, value in values.items():
            if key not in BY_KEY:
                raise Invalid(f"{key} is not a setting the app changes")
            if self.locked(key):
                raise Conflict(f"{key} is set in the config file; change it there")
            if BY_KEY[key].kind in ("text", "multiline") and isinstance(value, str) and not value.strip():
                value = None  # an empty box: its default
            if BY_KEY[key].kind == "args" and isinstance(value, str):
                try:
                    value = shlex.split(value) or None  # as a shell would split it; empty: the default
                except ValueError as exc:
                    raise Invalid(f"{key}: {exc}") from exc
            checked[key] = None if value is None else self._valid(key, value)
        now = datetime.now(UTC).isoformat()
        with self.db.connect() as conn:
            for key, value in checked.items():
                if value is None:
                    conn.execute("DELETE FROM settings_values WHERE key = ?", (key,))
                else:
                    conn.execute(
                        "INSERT INTO settings_values (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)"
                        " ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at,"
                        " updated_by = excluded.updated_by",
                        (key, json.dumps(value), now, actor),
                    )
        for key, value in checked.items():
            effective = _get(self.defaults, key) if value is None else value
            if BY_KEY[key].applies == "now":
                _put(self.settings, key, effective)
                self.running[key] = effective
                for listener in self.listeners:
                    listener(key, effective)
            self.audit.record(actor, "settings", None, f"{key}={json.dumps(value)}")
        return self.views()

    def _valid(self, key: str, value: Any) -> Any:
        """The value as the setting takes it (e.g. "30" for a number), or Invalid saying why not."""
        table, name = key.split(".")
        section = getattr(self.defaults, table)
        try:
            checked = type(section).model_validate({**section.model_dump(), name: value})
        except ValidationError as exc:
            raise Invalid(f"{key}: {exc.errors()[0]['msg']}") from exc
        result = getattr(checked, name)
        if BY_KEY[key].kind == "per_runtime":
            modes = self.modes()
            for runtime, mode in result.items():
                if runtime not in modes:
                    raise Invalid(f"{key}: no runtime {runtime!r} here (there are: {', '.join(sorted(modes))})")
                if mode not in modes[runtime]:
                    known = ", ".join(modes[runtime]) or "none"
                    raise Invalid(f"{key}: {runtime} has no permission mode {mode!r} (it has: {known})")
        return result.value if hasattr(result, "value") else result

    def _stored(self) -> dict[str, Any]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT key, value FROM settings_values").fetchall()
        return {row["key"]: json.loads(row["value"]) for row in rows}

    def _view(self, field: CatalogField, stored: dict[str, Any]) -> SettingView:
        key = field.key
        default = _get(self.defaults, key)
        if self.locked(key):
            source: Source = "config_file"
            value = _get(self.settings, key)
        elif key in stored:
            source, value = "app", stored[key]
        else:
            source, value = "default", default
        return SettingView(
            key=key, section=field.section, label=field.label, help=field.help, kind=field.kind,
            choices=list(field.choices), runtime_choices=self.modes() if field.kind == "per_runtime" else {},
            value=value, default=default, source=source, applies=field.applies,
            pending=field.applies == "restart" and value != self.running[key], hub_only=field.hub_only,
        )  # fmt: skip
