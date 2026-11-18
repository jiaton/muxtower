"""Which language Read aloud speaks in: the one set (`listen.language`, a tag such as zh, en, ja), or, set
to auto, the reply's own, told apart by its script (Han, kana, Hangul; anything else is taken for English,
and the summary then follows the reply's language by itself)."""

import re

NAMES = {
    "zh": "Chinese (Mandarin, simplified)", "en": "English", "ja": "Japanese", "ko": "Korean", "de": "German",
    "fr": "French", "es": "Spanish", "pt": "Portuguese", "it": "Italian", "ru": "Russian", "nl": "Dutch",
}  # fmt: skip
AUTO = "auto"
SAME_AS_REPLY = "the language the assistant's reply is written in"

_HAN = re.compile(r"[㐀-䶿一-鿿]")
_KANA = re.compile(r"[぀-ヿ]")
_HANGUL = re.compile(r"[가-힯]")
_LETTER = re.compile(r"[^\W\d_]")


def detect(text: str) -> str:
    """The reply's language as a tag, by its script: ko, ja, zh, else en."""
    letters = len(_LETTER.findall(text)) or 1
    if len(_HANGUL.findall(text)) / letters > 0.2:
        return "ko"
    if _KANA.search(text) and (len(_KANA.findall(text)) + len(_HAN.findall(text))) / letters > 0.2:
        return "ja"
    if len(_HAN.findall(text)) / letters > 0.2:
        return "zh"
    return "en"


def language_of(setting: str, reply: str) -> str:
    """The tag a turn is spoken in: the one set, else the reply's."""
    tag = (setting or AUTO).strip().lower()
    return detect(reply) if tag == AUTO else tag


def named(setting: str) -> str:
    """How the prompt names it: the language set, or (auto) the reply's own."""
    tag = (setting or AUTO).strip().lower()
    return SAME_AS_REPLY if tag == AUTO else NAMES.get(tag, tag)
