"""Runtime definitions loaded from TOML: shipped defaults in runtimes/defaults/, overridden file-by-file
by $XDG_CONFIG_HOME/muxtower/runtimes/<name>.toml. A user file with the same name replaces the shipped
one entirely; a new file adds a runtime."""

import logging
import re
import time
import tomllib
from dataclasses import dataclass, field
from importlib import resources
from pathlib import Path

from pydantic import BaseModel, Field, field_validator

from muxtower.runtimes.models import APPROVABLE_STATES, AgentState, Option

logger = logging.getLogger("muxtower.runtimes")


class Step(BaseModel):
    """One thing to send: literal text (may contain "{option}") or a tmux key name."""

    text: str | None = None
    key: str | None = None


def _anchored(pattern: str) -> str:
    """A pattern that opens with a lookahead is tried at every position of the screen, and each try scans
    to its end (screens are matched with DOTALL): quadratic, tens of milliseconds a pane a second."""
    if pattern.startswith("(?=") or pattern.startswith("(?!"):
        raise ValueError(f"pattern {pattern!r} opens with a lookahead: anchor it, \\A(?=…)")
    return pattern


class RuleConfig(BaseModel):
    name: str
    state: AgentState
    pattern: str
    # Search only the screen's last lines (blank ones below the last text not counted); 0: all of it. For a
    # sign that sits at the bottom, so the same words in the conversation above it do not count.
    last_lines: int = Field(default=0, ge=0)
    # Look only at what is above the input box (`RuntimeConfig.prompt`), while it shows: the end of the
    # conversation, for a sign that only counts as the last thing said (an error the agent ended on).
    above_prompt: bool = False

    @field_validator("pattern")
    @classmethod
    def anchored_lookahead(cls, pattern: str) -> str:
        return _anchored(pattern)


class MenuConfig(BaseModel):
    """How a dialog's choices look: one line starts with the cursor glyph, the other choices sit in the
    same column right above/below it, optionally numbered ("1. Yes")."""

    cursor: str = "❯"
    # Other glyphs a dialog of its marks the highlighted choice with, tried when none shows `cursor` (Codex's
    # first-start sign-in uses ">").
    other_cursors: list[str] = Field(default_factory=list)
    search_last_lines: int = 40


class ApproveConfig(BaseModel):
    # Per state: label patterns tried in order; the first matching option is chosen. An empty list means
    # "never pick for me": approving that state needs an explicit option.
    prefer: dict[AgentState, list[str]] = Field(default_factory=dict)
    # Fallback for every state when no preferred label is on screen.
    default: list[str] = Field(default_factory=lambda: [r"^Yes\b"])
    up_key: str = "Up"
    down_key: str = "Down"
    confirm_key: str = "Enter"


class DenyConfig(BaseModel):
    send: list[Step] = Field(default_factory=lambda: [Step(key="Escape")])


class ContextConfig(BaseModel):
    """What a dialog asks about, read off the screen for whoever approves it elsewhere (`pending.tool_name`
    and `pending.detail`, when no hook said). Searched only where the dialog is (`Runtime.dialog_lines`),
    its last `last_lines`, from its top line on: the words of an older call or a quoted dialog in the
    conversation are not it."""

    # The dialog's first line (a rule above it); the last such line counts. Without one, or when none shows,
    # the details are searched in all of the dialog's lines and no tool is read.
    top: str | None = None
    # Group 1 is the tool: the first line matching it going up from the top line (the call the dialog is
    # about), within `tool_lines`, and before an earlier top line or a `tool_stop` line (another item of
    # the conversation) that it does not match.
    tool: str | None = None
    tool_stop: str | None = None
    tool_lines: int = Field(default=8, ge=1)
    # Tried in order on the dialog from its top line, the first match's group 1 is the detail: its lines
    # stripped, blank ones dropped, cut to `detail_chars`.
    detail: list[str] = Field(default_factory=list)
    detail_chars: int = Field(default=500, ge=20, le=4000)
    last_lines: int = Field(default=40, ge=1)

    @field_validator("top", "tool", "tool_stop")
    @classmethod
    def anchored_tool(cls, pattern: str | None) -> str | None:
        return _anchored(pattern) if pattern else pattern

    @field_validator("detail")
    @classmethod
    def anchored_detail(cls, patterns: list[str]) -> list[str]:
        return [_anchored(p) for p in patterns]


class PermissionMode(BaseModel):
    """A way to start the agent with more or less asked of the owner: what it adds to the command line."""

    id: str
    label: str
    args: list[str]
    dangerous: bool = False  # nothing asked, or nothing sandboxed: warned about, never an agent's to pick
    usual: bool = False  # what the agent does when its own settings say nothing (its place in the order)


class RuntimeConfig(BaseModel):
    name: str
    binary: str
    hooks: str | None = None  # name of a hook integration, e.g. "claude-code"
    default_state: AgentState = AgentState.UNKNOWN
    auto_approve_states: list[AgentState] = Field(default_factory=list)
    # Seconds between typed text and the Enter that sends it. A TUI that takes quickly typed characters
    # for a paste (Codex) turns an Enter right behind them into a new line instead of sending.
    enter_delay: float = Field(default=0.0, ge=0, le=2)
    # A hook that says "working" is believed until the screen has shown no sign of work for this many seconds
    # (0: always). For an agent whose hooks do not report every way a turn ends (Codex has no failure event).
    busy_stale_seconds: float = Field(default=0.0, ge=0)
    rules: list[RuleConfig] = Field(default_factory=list)
    # Starting it again after its machine restarted (`sessions/interrupted.py`): what resumes a conversation
    # (followed by its id), and which options take a value, to tell them from a first prompt (never resent).
    resume: list[str] = Field(default_factory=list)
    option_values: list[str] = Field(default_factory=list)
    # The agent's input box, as it shows at the bottom (a match starts at its first line). A dialog either
    # takes its place, or (`panel_rule`) sits right above it, framed by rule lines. While the box shows,
    # rules for a dialog see only that framed panel, or nothing: the words a dialog uses, quoted in a reply
    # or a diff above the box, do not make one.
    prompt: str | None = None
    prompt_last_lines: int = Field(default=12, ge=1)
    panel_rule: str | None = None  # a line that frames the box and a panel above it, e.g. '^─{8,}\s*$'
    panel_lines: int = Field(default=25, ge=1)  # the tallest such panel
    menu: MenuConfig = Field(default_factory=MenuConfig)
    context: ContextConfig = Field(default_factory=ContextConfig)
    approve: ApproveConfig = Field(default_factory=ApproveConfig)
    deny: DenyConfig = Field(default_factory=DenyConfig)
    # The permission modes it can be started in, least to most permissive (`sessions/launch.py`).
    permission_modes: list[PermissionMode] = Field(default_factory=list)


@dataclass
class Menu:
    options: list[Option]
    cursor: int  # index of the highlighted option


@dataclass
class Classification:
    state: AgentState
    rule: str | None  # name of the matching rule, None when default_state applied
    menu: Menu | None = None
    # The rule that took longest to try, and its seconds: what shows a rule gone slow (`usage/`).
    slowest: tuple[str, float] | None = field(default=None, compare=False)
    # What a dialog asks about, read off it (`ContextConfig`): set only when a dialog's rule matched.
    tool_name: str | None = None
    detail: str | None = None

    @property
    def options(self) -> list[Option]:
        return self.menu.options if self.menu else []


_NUMBERED = re.compile(r"^(\d+)\.\s+(.*)$")
CHOSEN = "✔"  # marks the choice in effect (Claude Code's theme), next to the cursor or on its own


class Runtime:
    """A runtime with its screen rules compiled."""

    def __init__(self, config: RuntimeConfig, source: str) -> None:
        self.config = config
        self.source = source
        self.rules = [(r, re.compile(r.pattern, re.DOTALL)) for r in config.rules]
        self.prompt = re.compile(config.prompt, re.MULTILINE) if config.prompt else None
        self.panel_rule = re.compile(config.panel_rule) if config.panel_rule else None
        self.prefer = {state: [re.compile(p) for p in ps] for state, ps in config.approve.prefer.items()}
        self.default = [re.compile(p) for p in config.approve.default]
        context = config.context
        self.context_top = re.compile(context.top) if context.top else None
        self.context_tool = re.compile(context.tool) if context.tool else None
        self.context_stop = re.compile(context.tool_stop) if context.tool_stop else None
        self.context_detail = [re.compile(p) for p in context.detail]

    @property
    def name(self) -> str:
        return self.config.name

    def box_at(self, lines: list[str]) -> int | None:
        """The line the input box starts on, while it shows at the bottom."""
        shown = max(len(lines) - self.config.prompt_last_lines, 0)
        found = self.prompt.search("\n".join(lines[shown:])) if self.prompt else None
        return shown + found.string.count("\n", 0, found.start()) if found else None

    def dialog_lines(self, lines: list[str], box: int | None) -> list[str] | None:
        """Where a dialog can be: the whole screen while no input box shows at the bottom; else only the panel
        framed right above the box (`panel_rule`), or nowhere (None)."""
        if box is None:
            return lines
        if self.panel_rule is None:
            return None
        rule = self.panel_rule
        top = next(
            (i for i in range(box - 1, max(box - self.config.panel_lines, 0) - 1, -1) if rule.match(lines[i])), None
        )
        return lines[top + 1 : box] if top is not None else None

    def classify(self, screen: str) -> Classification:
        lines = screen.rstrip().splitlines()
        box = self.box_at(lines)
        dialog = self.dialog_lines(lines, box)
        above = lines[:box] if box is not None else lines
        slowest: tuple[str, float] | None = None
        for rule, pattern in self.rules:
            seen = dialog if rule.state in APPROVABLE_STATES else above if rule.above_prompt else lines
            if seen is None:
                continue
            started = time.perf_counter()
            found = pattern.search("\n".join(seen[-rule.last_lines :]) if rule.last_lines else "\n".join(seen))
            took = time.perf_counter() - started
            if slowest is None or took > slowest[1]:
                slowest = (rule.name, took)
            if found:
                menu = self.parse_menu(screen) if rule.state != AgentState.BUSY else None
                if rule.state in APPROVABLE_STATES and dialog is not None:
                    tool, detail = self.context_of(dialog)
                    return Classification(rule.state, rule.name, menu, slowest, tool, detail)
                return Classification(rule.state, rule.name, menu, slowest)
        return Classification(self.config.default_state, None, None, slowest)

    def context_of(self, dialog: list[str]) -> tuple[str | None, str | None]:
        """The tool a dialog is about and what it would do, from the dialog's own lines (`ContextConfig`)."""
        context = self.config.context
        lines = dialog[-context.last_lines :]
        top = None
        if self.context_top:
            top = next((i for i in range(len(lines) - 1, -1, -1) if self.context_top.match(lines[i])), None)
        tool = None
        if top is not None and self.context_tool:
            for line in reversed(lines[max(top - context.tool_lines, 0) : top]):
                if found := self.context_tool.match(line):
                    tool = found.group(1).strip() or None
                    break
                if (self.context_top and self.context_top.match(line)) or (
                    self.context_stop and self.context_stop.match(line)
                ):
                    break
        text = "\n".join(lines[top or 0 :])
        for pattern in self.context_detail:
            found = pattern.search(text)
            detail = (
                "\n".join(line.strip() for line in (found.group(1) or "").splitlines() if line.strip()) if found else ""
            )
            if detail:
                cut = (
                    detail if len(detail) <= context.detail_chars else detail[: context.detail_chars - 1].rstrip() + "…"
                )
                return tool, cut
        return tool, None

    def parse_menu(self, screen: str) -> Menu | None:
        """The lowest block of 2+ choices around a cursor line. A lone cursor line is the prompt input."""
        lines = screen.splitlines()[-self.config.menu.search_last_lines :]
        for cursor in (self.config.menu.cursor, *self.config.menu.other_cursors):
            for at in range(len(lines) - 1, -1, -1):
                if lines[at].lstrip().startswith(cursor):
                    menu = self._menu_at(lines, at, cursor)
                    if menu is not None and len(menu.options) >= 2:
                        return menu
        return None

    def _menu_at(self, lines: list[str], at: int, cursor: str) -> Menu | None:
        cursor_line = lines[at]
        if not cursor_line.lstrip()[len(cursor) :].strip():
            return None
        column = len(cursor_line) - len(cursor_line.lstrip()) + len(cursor)
        column += len(cursor_line[column:]) - len(cursor_line[column:].lstrip())  # text start
        if cursor_line[column:].startswith(CHOSEN):  # "❯ ✔ Dark mode": the others line up with "Dark"
            rest = cursor_line[column + len(CHOSEN) :]
            column += len(CHOSEN) + len(rest) - len(rest.lstrip())

        numbered_menu = bool(_NUMBERED.match(cursor_line.lstrip()[len(cursor) :].strip()))

        def kind(line: str) -> str | None:
            """ "choice" (text starts exactly at `column`), "more" (a wrapped label or a choice's description,
            indented deeper), "gap" (a blank line between numbered choices, as Codex spaces them)."""
            head, body = line[:column], line[column:]
            if not line.strip():
                return "gap" if numbered_menu else None
            if not body.strip() or head.replace(cursor, "").replace(CHOSEN, "").strip():
                return None
            if body[:1].isspace():
                return "more"
            # Among numbered choices a line without a number is not one: Codex asks "Implement this plan?"
            # on the line right above its choices, in the same column.
            return "choice" if not numbered_menu or _NUMBERED.match(body.strip()) else None

        first = at
        while first > 0 and kind(lines[first - 1]) is not None:
            first -= 1
        while kind(lines[first]) in ("more", "gap"):  # a block cannot start with a continuation
            first += 1
        last = at
        while last + 1 < len(lines) and kind(lines[last + 1]) is not None:
            last += 1
        while kind(lines[last]) == "gap":
            last -= 1
        spaced = any(kind(lines[i]) == "gap" for i in range(first, last + 1))

        # TUIs wrap at spaces and split a word only when it is longer than a whole line (long paths). So a
        # continuation joins without a space only after a full-width line that is one unbroken token. The
        # width comes from lines outside the menu: real screens have a full-width separator above it. In a
        # menu spaced by blank lines the deeper lines are each choice's description.
        outside = [len(line.rstrip()) for j, line in enumerate(lines) if not first <= j <= last]
        width = max(outside, default=0)
        labels: list[str] = []
        cursor_index = 0
        for i in range(first, last + 1):
            if kind(lines[i]) == "gap":
                continue
            text = lines[i][column:].strip()
            if kind(lines[i]) == "more" and labels:
                previous = lines[i - 1]
                one_token = " " not in previous.strip()
                cut = one_token and abs(len(previous.rstrip()) - width) <= 1
                labels[-1] += " · " + text if spaced and labels[-1].count(" · ") == 0 else ("" if cut else " ") + text
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
        """A state listed under [approve.prefer] uses only its own patterns (an empty list means a
        person always decides); other states fall back to [approve].default."""
        patterns = self.prefer[state] if state in self.prefer else self.default
        for pattern in patterns:
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
