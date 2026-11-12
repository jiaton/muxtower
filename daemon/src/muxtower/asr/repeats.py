"""Speech to text (Whisper) sometimes gives what was said twice, or more, in one transcript: the whole of it
repeated (most often a short clip), or its last sentence again. Said once, it is written once."""

import re

MIN_UNIT = 4  # letters or characters: a shorter repeat ("no, no") may well have been said
CJK = re.compile(r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]")  # written without spaces
SENTENCE = re.compile(r"[^。！？.!?\n]+[。！？.!?\n]*")


def _key(text: str) -> str:
    return re.sub(r"[\W_]+", "", text).casefold()


def _whole(text: str) -> str:
    """The text, if it is one part said k ≥ 2 times over (spacing and punctuation aside): that part once."""
    kept = [(i, c) for i, c in enumerate(text) if re.match(r"\w", c) and c != "_"]
    letters = "".join(c for _, c in kept).casefold()
    n = len(letters)
    for k in range(n // MIN_UNIT, 1, -1):  # the most copies first: the shortest part that repeats
        if n % k or letters != letters[: n // k] * k:
            continue
        last, following = kept[n // k - 1], kept[n // k]
        if following[0] == last[0] + 1 and not (CJK.match(last[1]) and CJK.match(following[1])):
            continue  # no break between the copies: one word, not a part said again
        end = last[0] + 1
        while end < len(text) and not text[end].isspace() and not re.match(r"\w", text[end]):
            end += 1  # its closing punctuation
        return text[:end].strip()
    return text


def _sentences(text: str) -> str:
    """The text without a sentence that only says again the one before it."""
    parts = SENTENCE.findall(text)
    if len(parts) < 2:
        return text
    kept: list[str] = []
    for part in parts:
        if kept and len(_key(part)) >= MIN_UNIT and _key(part) == _key(kept[-1]):
            continue
        kept.append(part)
    return "".join(kept).strip() if len(kept) < len(parts) else text


def unrepeated(text: str) -> str:
    """What was said, once: a transcript that is one part over and over, or says a sentence twice running."""
    return _sentences(_whole(text.strip()))
