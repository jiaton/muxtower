"""The voice dictionary: words speech to text should know (put in its prompt, within what Whisper reads of
it), and corrections of what it still writes wrong ("heard" → "write", applied to every transcript). Kept on
the hub, the same for every device; edited in the app's settings.

Whisper reads only about the last 224 tokens of its prompt: the words go at its end, as many as fit, and the
rest of the prompt (the built-in line, the owner's `[asr] prompt`) is cut from its start to make room."""

import math
import re

from pydantic import BaseModel, Field, field_validator

from muxtower.infra.db import Database

MAX_WORDS = 200
MAX_CORRECTIONS = 200
MAX_TEXT = 80
TOKEN_BUDGET = 224  # what Whisper reads of a prompt, in its tokens (the last ones)
WORDS_LEAD = "Vocabulary: "
CJK = re.compile(r"[぀-ヿ㐀-鿿가-힯豈-﫿]")


class Correction(BaseModel):
    heard: str = Field(min_length=1, max_length=MAX_TEXT, description="what speech to text writes")
    write: str = Field(max_length=MAX_TEXT, description="what to write instead (literal; empty: drop it)")

    @field_validator("heard")
    @classmethod
    def something(cls, heard: str) -> str:
        if not heard.strip():
            raise ValueError("a correction needs what is heard")
        return heard.strip()


class Dictionary(BaseModel):
    words: list[str] = Field(default_factory=list, max_length=MAX_WORDS, description="in priority order")
    corrections: list[Correction] = Field(
        default_factory=list, max_length=MAX_CORRECTIONS, description="applied in order"
    )

    @field_validator("words")
    @classmethod
    def words_given(cls, words: list[str]) -> list[str]:
        cleaned = [" ".join(w.split()) for w in words]
        if any(not w or len(w) > MAX_TEXT for w in cleaned):
            raise ValueError(f"a word is 1 to {MAX_TEXT} characters")
        return list(dict.fromkeys(cleaned))


class DictionaryFit(BaseModel):
    words_in_prompt: int = Field(description="how many of the words (the first ones) fit in what Whisper reads")
    words: int
    tokens: int = Field(description="the prompt's estimated tokens")
    budget: int = TOKEN_BUDGET


class DictionaryView(Dictionary):
    fit: DictionaryFit


class DictionaryStore:
    def __init__(self, db: Database) -> None:
        self.db = db

    def load(self) -> Dictionary:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT kind, heard, write FROM asr_dictionary ORDER BY position").fetchall()
        return Dictionary(
            words=[r["heard"] for r in rows if r["kind"] == "word"],
            corrections=[Correction(heard=r["heard"], write=r["write"]) for r in rows if r["kind"] == "correction"],
        )

    def replace(self, dictionary: Dictionary) -> Dictionary:
        rows = [("word", w, "") for w in dictionary.words] + [
            ("correction", c.heard, c.write) for c in dictionary.corrections
        ]
        with self.db.connect() as conn:
            conn.execute("DELETE FROM asr_dictionary")
            conn.executemany(
                "INSERT INTO asr_dictionary (position, kind, heard, write) VALUES (?, ?, ?, ?)",
                [(i, *row) for i, row in enumerate(rows)],
            )
        return self.load()


# --- the prompt ---------------------------------------------------------------------------------------------


def tokens(text: str) -> int:
    """A cautious estimate of Whisper's tokens for `text`: a word about one per 4 letters, a CJK character
    up to two, each other sign one."""
    count = 2 * len(CJK.findall(text))
    for piece in re.findall(r"[^\W\d_]+|\d+|[^\s\w]", CJK.sub(" ", text)):
        count += math.ceil(len(piece) / 4) if piece[0].isalnum() else 1
    return count


def prompt_with(rest: str, words: list[str], budget: int = TOKEN_BUDGET, max_bytes: int = 880) -> tuple[str, int]:
    """The prompt: `rest` (the built-in line and the owner's), then the words, as many as fit in `budget`
    tokens and `max_bytes` (the provider's limit), first ones first. `rest` is cut from its start to fit what
    is left (Whisper keeps a prompt's end). Returns it and how many words it holds."""
    taken: list[str] = []
    for word in words:
        line = WORDS_LEAD + ", ".join([*taken, word]) + "."
        if tokens(line) > budget or len(line.encode()) > max_bytes:
            break
        taken.append(word)
    tail = WORDS_LEAD + ", ".join(taken) + "." if taken else ""
    room, room_bytes = budget - tokens(tail), max_bytes - len(tail.encode()) - 1
    head = rest.strip()
    while head and (tokens(head) > room or len(head.encode()) > room_bytes):
        cut = head.find(" ", 1)
        head = head[cut + 1 :] if cut > 0 else head[1:]  # from its start, a word (or a character) at a time
    return " ".join(p for p in (head, tail) if p), len(taken)


# --- corrections --------------------------------------------------------------------------------------------


def _pattern(heard: str) -> re.Pattern[str]:
    """How a correction finds its words: case aside, any run of spaces for a space; a whole word or phrase
    (not inside a longer word), except in CJK, which has no spaces between words."""
    body = r"\s+".join(re.escape(part) for part in heard.split())
    if CJK.search(heard):
        return re.compile(body, re.IGNORECASE)
    start = r"(?<!\w)" if heard[0].isalnum() or heard[0] == "_" else ""
    end = r"(?!\w)" if heard[-1].isalnum() or heard[-1] == "_" else ""
    return re.compile(start + body + end, re.IGNORECASE)


def corrected(text: str, corrections: list[Correction]) -> str:
    """The text with each correction applied, in order: a part of it is replaced once at most (an earlier
    correction's wins, and what one writes is not corrected again), literally."""
    taken: list[tuple[int, int, str]] = []
    for rule in corrections:
        for m in _pattern(rule.heard).finditer(text):
            if m.start() == m.end() or any(m.start() < e and s < m.end() for s, e, _ in taken):
                continue
            taken.append((m.start(), m.end(), rule.write))
    out, at = [], 0
    for start, end, write in sorted(taken):
        out += [text[at:start], write]
        at = end
    out.append(text[at:])
    return re.sub(r"[ \t]{2,}", " ", "".join(out)).strip() if any(not w for *_, w in taken) else "".join(out)
