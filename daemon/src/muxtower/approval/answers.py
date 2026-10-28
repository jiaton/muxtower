"""Answering a multiple-choice prompt all at once: Claude Code's AskUserQuestion can ask several questions,
some taking any number of options. Remote Control takes the answers as they are; in a terminal they are
keys, one question at a time, each step read back from the screen before the next:

    ←  ☐ Fruit  ☐ Size  ✔ Submit  →         a tab per question, then a review
    Which fruits do you like?
    ❯ 1. [ ] Apple                          a multi-select option: Enter ticks it
      2. [ ] Banana
      3. [ ] Type something
         Next                               …and this goes on (Submit, when it is the only question)
    Which size?
    ❯ 1. Small                              a single choice: Enter picks it and goes on
    Ready to submit your answers?
    ❯ 1. Submit answers
"""

import re
import time
from collections.abc import Callable

from muxtower.errors import Conflict, Invalid
from muxtower.runtimes.models import PendingQuestion
from muxtower.runtimes.spec import Menu, Runtime, Step

STEP_SECONDS = 4.0  # how long one step may take to show on screen
POLL_SECONDS = 0.15
SUBMIT = "Submit answers"
DONE = ("Next", "Submit")  # under a multi-select question's options (Submit when it is the only question)


def check_answers(questions: list[PendingQuestion], answers: list[list[str]]) -> list[list[str]]:
    """The labels picked for each question, checked against what it offers."""
    if not questions:
        raise Conflict("this prompt's questions are not known: pick an option")
    if len(answers) != len(questions):
        raise Invalid(f"answer each of the {len(questions)} questions")
    checked = []
    for question, picked in zip(questions, answers, strict=True):
        picked = list(dict.fromkeys(picked))
        offered = {o.label for o in question.options}
        if not picked:
            raise Invalid(f"pick an answer to {question.question!r}")
        if len(picked) > 1 and not question.multi_select:
            raise Invalid(f"{question.question!r} takes one answer")
        if unknown := [label for label in picked if label not in offered]:
            raise Invalid(f"{question.question!r} offers no {unknown[0]!r}")
        checked.append(picked)
    return checked


def _plain(label: str) -> str:
    return re.sub(r"^\[.\]\s*", "", label).strip()  # a multi-select option's box: [ ] or [✔]


def find(menu: Menu, label: str) -> int | None:
    """Where an option is in a menu read off the screen, whose labels may run on into the description
    (`parse_menu` joins its lines)."""
    plains = [_plain(o.label) for o in menu.options]
    exact = next((i for i, p in enumerate(plains) if p == label), None)
    return exact if exact is not None else next((i for i, p in enumerate(plains) if p.startswith(f"{label} ")), None)


class TerminalAnswers:
    def __init__(
        self, runtime: Runtime, read: Callable[[], str], send: Callable[[list[Step]], None],
        sleep: Callable[[float], None] = time.sleep, clock: Callable[[], float] = time.monotonic,
    ) -> None:  # fmt: skip
        self.runtime, self.read, self.send, self.sleep, self.clock = runtime, read, send, sleep, clock
        self.shown = ""  # the screen as it was when keys were last sent

    def _menu(self, ready: Callable[[Menu], bool]) -> Menu | None:
        """The menu on screen once it has changed since the last keys, is drawn (the same on two reads in a
        row: keys show over several frames) and `ready` holds; None on timeout."""
        until = self.clock() + STEP_SECONDS
        before = None
        while True:
            text = self.read()
            settled, before = text == before, text
            menu = self.runtime.parse_menu(text) if settled and text != self.shown else None
            if menu is not None and ready(menu):
                self.shown = text
                return menu
            if self.clock() >= until:
                return None
            self.sleep(POLL_SECONDS)

    def _press(self, menu: Menu, index: int) -> None:
        keys = self.runtime.config.approve
        move = keys.down_key if index > menu.cursor else keys.up_key
        self.send([Step(key=move)] * abs(index - menu.cursor) + [Step(key=keys.confirm_key)])

    def run(self, questions: list[PendingQuestion], answers: list[list[str]]) -> None:
        for number, (question, labels) in enumerate(zip(questions, answers, strict=True), 1):
            stuck = Conflict(f"could not answer question {number} on screen: finish it in the terminal")
            for label in labels:

                def offers(m: Menu, label: str = label) -> bool:
                    return find(m, label) is not None

                menu = self._menu(offers)
                if menu is None:
                    raise stuck
                self._press(menu, find(menu, label) or 0)
            if question.multi_select:  # past the last option ("Type something"): Next, or Submit
                menu = self._menu(lambda m: _plain(m.options[-1].label).endswith(DONE))
                if menu is None:
                    raise stuck
                self._press(menu, len(menu.options))
        if len(questions) > 1 or questions[0].multi_select:  # a review; a single choice is done once picked
            menu = self._menu(lambda m: find(m, SUBMIT) is not None)
            if menu is None:
                raise Conflict("the answers were not offered for submitting: finish in the terminal")
            self._press(menu, find(menu, SUBMIT) or 0)
