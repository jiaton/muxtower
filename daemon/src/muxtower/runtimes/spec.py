"""Runtime definitions loaded from TOML: shipped defaults in runtimes/defaults/, overridden file-by-file
by $XDG_CONFIG_HOME/muxtower/runtimes/<name>.toml. A user file with the same name replaces the shipped
one entirely; a new file adds a runtime."""

import logging
import re
import tomllib
from dataclasses import dataclass
from importlib import resources
from pathlib import Path

from pydantic import BaseModel, Field

from muxtower.runtimes.models import AgentState, Option

logger = logging.getLogger("muxtower.runtimes")


class Step(BaseModel):
    """One thing to send: literal text (may contain "{option}") or a tmux key name."""

    text: str | None = None
    key: str | None = None


class RuleConfig(BaseModel):
    name: str
    state: AgentState
    pattern: str


class MenuConfig(BaseModel):
    """How a dialog's choices look: one line starts with the cursor glyph, the other choices sit in the
    same column right above/below it, optionally numbered ("1. Yes")."""

    cursor: str = "❯"
    search_last_lines: int = 40


class ApproveConfig(BaseModel):
    # Per state: label patterns tried in order; the first matching option is chosen.
    prefer: dict[AgentState, list[str]] = Field(default_factory=dict)
    # Fallback for every state when no preferred label is on screen.
    default: list[str] = Field(default_factory=lambda: [r"^Yes\b"])
    up_key: str = "Up"
    down_key: str = "Down"
    confirm_key: str = "Enter"


class DenyConfig(BaseModel):
    send: list[Step] = Field(default_factory=lambda: [Step(key="Escape")])


class RuntimeConfig(BaseModel):
    name: str
    binary: str
    hooks: str | None = None  # name of a hook integration, e.g. "claude-code"
    default_state: AgentState = AgentState.UNKNOWN
    auto_approve_states: list[AgentState] = Field(default_factory=list)
    rules: list[RuleConfig] = Field(default_factory=list)
    menu: MenuConfig = Field(default_factory=MenuConfig)
    approve: ApproveConfig = Field(default_factory=ApproveConfig)
    deny: DenyConfig = Field(default_factory=DenyConfig)


@dataclass
class Menu:
    options: list[Option]
    cursor: int  # index of the highlighted option


@dataclass
class Classification:
    state: AgentState
    rule: str | None  # name of the matching rule, None when default_state applied
    menu: Menu | None = None

    @property
    def options(self) -> list[Option]:
        return self.menu.options if self.menu else []


_NUMBERED = re.compile(r"^(\d+)\.\s+(.*)$")


class Runtime:
    """A runtime with its screen rules compiled."""

    def __init__(self, config: RuntimeConfig, source: str) -> None:
        self.config = config
        self.source = source
        self.rules = [(r, re.compile(r.pattern, re.DOTALL)) for r in config.rules]
        self.prefer = {state: [re.compile(p) for p in ps] for state, ps in config.approve.prefer.items()}
        self.default = [re.compile(p) for p in config.approve.default]

    @property
    def name(self) -> str:
        return self.config.name

    def classify(self, screen: str) -> Classification:
        for rule, pattern in self.rules:
            if pattern.search(screen):
                menu = self.parse_menu(screen) if rule.state != AgentState.BUSY else None
                return Classification(rule.state, rule.name, menu)
        return Classification(self.config.default_state, None)

    def parse_menu(self, screen: str) -> Menu | None:
        """The lowest block of 2+ choices around a cursor line. A lone cursor line is the prompt input."""
        cursor = self.config.menu.cursor
        lines = screen.splitlines()[-self.config.menu.search_last_lines :]
        for at in range(len(lines) - 1, -1, -1):
            if lines[at].lstrip().startswith(cursor):
                menu = self._menu_at(lines, at)
                if menu is not None and len(menu.options) >= 2:
                    return menu
        return None

    def _menu_at(self, lines: list[str], at: int) -> Menu | None:
        cursor = self.config.menu.cursor
        cursor_line = lines[at]
        if not cursor_line.lstrip()[len(cursor) :].strip():
            return None
        column = len(cursor_line) - len(cursor_line.lstrip()) + len(cursor)
        column += len(cursor_line[column:]) - len(cursor_line[column:].lstrip())  # text start

        def kind(line: str) -> str | None:
            """ "choice" (text starts exactly at `column`), "more" (a wrapped label, indented deeper)."""
            head, body = line[:column], line[column:]
            if not body.strip() or head.replace(cursor, "").strip():
                return None
            return "more" if body[:1].isspace() else "choice"

        first = at
        while first > 0 and kind(lines[first - 1]) is not None:
            first -= 1
        while kind(lines[first]) == "more":  # a block cannot start with a continuation
            first += 1
        last = at
        while last + 1 < len(lines) and kind(lines[last + 1]) is not None:
            last += 1

        labels: list[str] = []
        cursor_index = 0
        for i in range(first, last + 1):
            text = lines[i][column:].strip()
            if kind(lines[i]) == "more" and labels:
                labels[-1] += " " + text
                continue
            if i == at:
                cursor_index = len(labels)
            labels.append(text)
        options = []
        for position, label in enumerate(labels, 1):
            numbered = _NUMBERED.match(label)
            key, text = (numbered.group(1), numbered.group(2)) if numbered else (str(position), label)
            options.append(Option(key=key, label=text.strip()))
        return Menu(options=options, cursor=cursor_index)

    def choose_option(self, state: AgentState, options: list[Option]) -> str | None:
        for pattern in [*self.prefer.get(state, []), *self.default]:
            for option in options:
                if pattern.search(option.label):
                    return option.key
        return None

    def select_steps(self, menu: Menu, key: str) -> list[Step]:
        """Arrow keys from the highlighted option to `key`, then confirm. Never types digits, so a
        stray keystroke cannot land in the next dialog or the prompt."""
        target = next(i for i, o in enumerate(menu.options) if o.key == key)
        move = self.config.approve.down_key if target > menu.cursor else self.config.approve.up_key
        return [Step(key=move)] * abs(target - menu.cursor) + [Step(key=self.config.approve.confirm_key)]


def _load_dir(directory: Path | resources.abc.Traversable, source: str) -> dict[str, Runtime]:
    found: dict[str, Runtime] = {}
    if not directory.is_dir():
        return found
    for entry in sorted(directory.iterdir(), key=lambda e: e.name):
        if not entry.name.endswith(".toml"):
            continue
        try:
            config = RuntimeConfig.model_validate(tomllib.loads(entry.read_text()))
            found[config.name] = Runtime(config, f"{source}:{entry.name}")
        except (ValueError, re.error) as exc:
            # A broken user file must not take the daemon down; log and keep the shipped default.
            logger.error("ignoring runtime file %s: %s", entry.name, exc)
    return found


def load_runtimes(user_dir: Path | None) -> dict[str, Runtime]:
    runtimes = _load_dir(resources.files("muxtower.runtimes") / "defaults", "builtin")
    if user_dir is not None:
        runtimes.update(_load_dir(user_dir, "user"))
    return runtimes
