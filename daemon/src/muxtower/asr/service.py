from collections.abc import Callable

from muxtower.asr.dictionary import Dictionary, DictionaryFit, corrected, prompt_with, tokens
from muxtower.asr.models import Transcript
from muxtower.asr.ports import Transcriber
from muxtower.asr.repeats import unrepeated
from muxtower.errors import Conflict, Invalid

MAX_AUDIO_BYTES = 4 * 1024 * 1024  # ~2 minutes of 16 kHz mono 16-bit WAV
AUDIO_TYPES = ("audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/m4a")


# Whisper follows the style and words of its prompt: this one names what is said to an agent, so that
# jargon is spelled right. In no one language: the owner's own words (`[asr] prompt`) come after it, and a
# language's guidance (a script to write it in, say) belongs there. Nothing private goes to the provider in
# it: no session names, only these words and the owner's.
BASE_PROMPT = "Spoken to a coding agent: Claude, Codex, tmux, git; approve, deny, interrupt, continue."
# For a recording that may be only a spoken command (Live mode's short segments): the command words of the
# languages the app listens for (it sends them), so a one-word clip is not heard as another language.
DEFAULT_COMMAND_WORDS = ("send", "pause", "resume", "clear", "undo")
MAX_COMMAND_WORDS = 20
# Groq refuses a prompt over 896 "characters", counted as UTF-8 bytes (a Chinese character is three).
MAX_PROMPT_BYTES = 880


class AsrService:
    def __init__(self, transcriber: Transcriber | None, language: str | None, extra_prompt: str | None = None) -> None:
        self.transcriber = transcriber
        self.language = language
        self.extra_prompt = extra_prompt
        # The voice dictionary (`dictionary.py`), read each time: its words end the prompt, its corrections
        # are applied to every transcript.
        self.dictionary: Callable[[], Dictionary] = Dictionary

    def prompt(self) -> str:
        """The base prompt, the owner's extra words, then the dictionary's words: within what Whisper reads
        of a prompt and the provider's byte limit (`dictionary.prompt_with`)."""
        return self.prompt_and_fit()[0]

    def prompt_and_fit(self) -> tuple[str, DictionaryFit]:
        words = self.dictionary().words
        rest = " ".join(p for p in (BASE_PROMPT, self.extra_prompt or "") if p)
        prompt, held = prompt_with(rest, words, max_bytes=MAX_PROMPT_BYTES)
        return prompt, DictionaryFit(words_in_prompt=held, words=len(words), tokens=tokens(prompt))

    @property
    def available(self) -> bool:
        return self.transcriber is not None

    def transcribe(
        self, audio: bytes, content_type: str, language: str | None, hint: str | None = None,
        words: list[str] | None = None,
    ) -> Transcript:  # fmt: skip
        if self.transcriber is None:
            raise Conflict("speech to text is not configured on this hub")
        kind = content_type.split(";", 1)[0].strip().lower()
        if kind not in AUDIO_TYPES:
            raise Invalid(f"unsupported audio type {kind!r}")
        if not audio:
            raise Invalid("no audio")
        if len(audio) > MAX_AUDIO_BYTES:
            raise Invalid("recording too long")
        # A command's language: the one configured, else the one asked for (the app tries zh, then en).
        used = (self.language or language) if hint == "command" else (language or self.language)
        prompt = command_prompt(words) if hint == "command" else self.prompt()
        text = self.transcriber.transcribe(audio, kind, used, prompt)
        # Once, then corrected: a correction never makes a repeat, nor hides one.
        return Transcript(text=corrected(unrepeated(text), self.dictionary().corrections), language=used)


def _fit(text: str) -> str:
    """At most MAX_PROMPT_BYTES of it, cut between characters."""
    return text.encode()[:MAX_PROMPT_BYTES].decode(errors="ignore")


def command_prompt(words: list[str] | None) -> str:
    """The command words to expect: those given (one line, a few, each short), else the English ones."""
    given = [" ".join(w.split()) for w in (words or [])[:MAX_COMMAND_WORDS] if w.strip()]
    return _fit(" ".join(given or DEFAULT_COMMAND_WORDS))
