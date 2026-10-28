"""A multiple-choice prompt answered all at once: checked against what it offers, then, in a terminal, as
keys one question at a time against Claude Code's screens (drawn here as it draws them)."""

import pytest

from muxtower.approval.answers import TerminalAnswers, check_answers
from muxtower.errors import Conflict, Invalid
from muxtower.runtimes.models import PendingQuestion, QuestionOption
from muxtower.runtimes.spec import Step, load_runtimes


def question(text: str, labels: list[str], multi: bool = False) -> PendingQuestion:
    options = [QuestionOption(label=label, description=label) for label in labels]
    return PendingQuestion(question=text, header=text.split()[1], multi_select=multi, options=options)


FRUIT = question("Which fruits do you like?", ["Apple", "Banana", "Cherry"], multi=True)
SIZE = question("Which size?", ["Small", "Large"])
RULE = "─" * 100


class ClaudeCodeDialog:
    """AskUserQuestion as Claude Code draws it: a tab per question, a review, and a cursor moved by keys."""

    def __init__(self, questions: list[PendingQuestion]) -> None:
        self.questions = questions
        self.tab, self.cursor = 0, 0
        self.ticked: list[set[str]] = [set() for _ in questions]
        self.picked: list[list[str]] = [[] for _ in questions]
        self.submitted = False

    def _rows(self) -> int:  # what the cursor can be on
        if self.tab == len(self.questions):
            return 2
        q = self.questions[self.tab]
        return len(q.options) + (2 if q.multi_select else 1)  # + Type something (+ Next)

    def key(self, step: Step) -> None:
        if step.key == "Down":
            self.cursor = min(self.cursor + 1, self._rows() - 1)
        elif step.key == "Up":
            self.cursor = max(self.cursor - 1, 0)
        elif step.key == "Enter":
            self._enter()

    def _enter(self) -> None:
        if self.tab == len(self.questions):
            self.submitted = self.cursor == 0
            return
        q = self.questions[self.tab]
        if self.cursor < len(q.options):
            label = q.options[self.cursor].label
            if q.multi_select:
                self.ticked[self.tab] ^= {label}
                return
            self.picked[self.tab] = [label]
        elif q.multi_select and self.cursor == len(q.options) + 1:  # Next
            self.picked[self.tab] = [o.label for o in q.options if o.label in self.ticked[self.tab]]
        else:
            return
        self.tab, self.cursor = self.tab + 1, 0
        if self.tab == len(self.questions) == 1 and not q.multi_select:  # a single choice needs no review
            self.submitted = True

    def screen(self) -> str:
        if self.submitted:
            return f"● The question was answered.\n{RULE}\n❯ \n{RULE}"
        lines = [RULE]
        if len(self.questions) > 1:
            lines.append("←  " + "  ".join(f"☐ {q.header}" for q in self.questions) + "  ✔ Submit  →")
        if self.tab == len(self.questions):
            lines += ["Review your answers", "Ready to submit your answers?"]
            lines += [
                f"{'❯' if self.cursor == i else ' '} {i + 1}. {t}" for i, t in enumerate(["Submit answers", "Cancel"])
            ]
            return "\n".join(lines)
        q = self.questions[self.tab]
        lines.append(q.question)
        for i, o in enumerate(q.options):
            box = ("[✔] " if o.label in self.ticked[self.tab] else "[ ] ") if q.multi_select else ""
            lines += [f"{'❯' if self.cursor == i else ' '} {i + 1}. {box}{o.label}", f"       {o.description}"]
        n = len(q.options)
        lines.append(f"{'❯' if self.cursor == n else ' '} {n + 1}. {'[ ] ' if q.multi_select else ''}Type something")
        if q.multi_select:
            lines.append(f"{'❯' if self.cursor == n + 1 else ' '}    {'Next' if len(self.questions) > 1 else 'Submit'}")
        lines += [RULE, f"  {n + 2}. Chat about this", "Enter to select · Tab/Arrow keys to navigate · Esc to cancel"]
        return "\n".join(lines)


def answer(dialog: ClaudeCodeDialog, answers: list[list[str]]) -> None:
    def send(steps: list[Step]) -> None:
        for step in steps:
            dialog.key(step)

    TerminalAnswers(load_runtimes(None)["claude-code"], dialog.screen, send, sleep=lambda _: None).run(
        dialog.questions, answers
    )


def test_several_questions_are_ticked_picked_and_submitted() -> None:
    dialog = ClaudeCodeDialog([FRUIT, SIZE])
    answer(dialog, [["Cherry", "Apple"], ["Large"]])
    assert dialog.submitted and dialog.picked == [["Apple", "Cherry"], ["Large"]]


def test_a_single_question_is_done_once_answered() -> None:
    dialog = ClaudeCodeDialog([SIZE])
    answer(dialog, [["Large"]])
    assert dialog.submitted and dialog.picked == [["Large"]]
    dialog = ClaudeCodeDialog([FRUIT])  # its options end in Submit, not Next
    answer(dialog, [["Banana"]])
    assert dialog.submitted and dialog.picked == [["Banana"]]


def test_a_dialog_that_does_not_follow_is_left_to_the_terminal() -> None:
    dialog = ClaudeCodeDialog([FRUIT, SIZE])
    dialog.screen = lambda: "something else entirely"  # type: ignore[method-assign]
    with pytest.raises(Conflict, match="question 1"):
        TerminalAnswers(load_runtimes(None)["claude-code"], dialog.screen, lambda _: None, sleep=lambda _: None,
                        clock=iter(range(100)).__next__).run([FRUIT, SIZE], [["Apple"], ["Small"]])  # fmt: skip


def test_answers_are_checked_against_the_questions() -> None:
    assert check_answers([FRUIT, SIZE], [["Apple", "Apple"], ["Small"]]) == [["Apple"], ["Small"]]
    with pytest.raises(Invalid, match="each of the 2"):
        check_answers([FRUIT, SIZE], [["Apple"]])
    with pytest.raises(Invalid, match="takes one answer"):
        check_answers([SIZE], [["Small", "Large"]])
    with pytest.raises(Invalid, match="offers no 'Kiwi'"):
        check_answers([FRUIT], [["Kiwi"]])
    with pytest.raises(Conflict):
        check_answers([], [["Apple"]])
