from collections.abc import Callable
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.asr.openai_compatible import OpenAICompatibleTranscriber
from muxtower.asr.service import BASE_PROMPT, AsrService
from muxtower.errors import Unavailable

WAV = b"RIFF" + b"\0" * 64


class FakeTranscriber:
    def __init__(self) -> None:
        self.calls: list[tuple[int, str, str | None]] = []
        self.prompts: list[str] = []

    def transcribe(self, audio: bytes, content_type: str, language: str | None, prompt: str | None) -> str:
        self.calls.append((len(audio), content_type, language))
        self.prompts.append(prompt or "")
        return "go on, then run the tests"


def _client(app: FastAPI) -> tuple[TestClient, dict[str, str]]:
    _, token = app.state.tokens.create("glasses")
    return TestClient(app), {"Authorization": f"Bearer {token}"}


def test_voice_is_off_until_configured(app: FastAPI) -> None:
    client, auth = _client(app)
    assert client.get("/v1/me", headers=auth).json()["features"] == {"summaries": False, "asr": False}
    res = client.post("/v1/asr", content=WAV, headers={**auth, "Content-Type": "audio/wav"})
    assert res.status_code == 409


def test_transcribes_and_audits_without_the_words(app: FastAPI) -> None:
    fake = FakeTranscriber()
    app.state.asr = AsrService(fake, language="zh", extra_prompt="Postgres, Redis")
    client, auth = _client(app)
    res = client.post("/v1/asr", content=WAV, headers={**auth, "Content-Type": "audio/wav"})
    assert res.json() == {"text": "go on, then run the tests", "language": "zh"}
    assert fake.calls == [(len(WAV), "audio/wav", "zh")]
    assert fake.prompts[0].startswith(BASE_PROMPT) and fake.prompts[0].endswith(" Postgres, Redis")  # then the owner's
    with app.state.audit.db.connect() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM audit_log WHERE action = 'asr'")]
    assert len(rows) == 1 and "go on" not in str(rows[0])
    assert client.post("/v1/asr", content=b"x", headers={**auth, "Content-Type": "text/plain"}).status_code == 400
    assert client.post("/v1/asr", content=WAV, headers={"Content-Type": "audio/wav"}).status_code == 401
    too_long = b"\0" * (4 * 1024 * 1024 + 1)
    assert client.post("/v1/asr", content=too_long, headers={**auth, "Content-Type": "audio/wav"}).status_code == 400


def test_provider_errors_become_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse(*_: object, **__: object) -> httpx.Response:
        return httpx.Response(401, json={"error": {"message": "bad key sk-secret"}})

    monkeypatch.setattr(httpx, "post", refuse)
    with pytest.raises(Unavailable) as caught:
        OpenAICompatibleTranscriber("groq", "sk-secret").transcribe(WAV, "audio/wav", None, None)
    assert "sk-secret" not in str(caught.value) and "401" in str(caught.value)
    assert "bad key" in str(caught.value)  # the provider's reason, the key taken out


def test_the_providers_reason_reaches_the_app_and_never_a_key(monkeypatch: pytest.MonkeyPatch, app: FastAPI) -> None:
    said = "prompt length must be 896 characters or fewer (key gsk_ABCDEF123456 sk-proj-zzzzzzzz)"

    def refuse(*_: object, **__: object) -> httpx.Response:
        return httpx.Response(400, json={"error": {"message": said, "type": "invalid_request_error"}})

    monkeypatch.setattr(httpx, "post", refuse)
    app.state.asr = AsrService(OpenAICompatibleTranscriber("groq", "gsk_real"), language=None)
    client, auth = _client(app)
    res = client.post("/v1/asr", content=WAV, headers={**auth, "Content-Type": "audio/wav"})
    assert res.status_code == 503  # not 502: a Cloudflare tunnel swaps a 502 for its own page
    detail = res.json()["detail"]
    assert detail.startswith("groq answered HTTP 400: prompt length must be 896 characters or fewer")
    assert "gsk_" not in detail and "sk-proj" not in detail


def test_the_prompt_is_the_base_and_the_owners_words_only_within_groqs_limit_in_bytes(
    app: FastAPI, tmp_path: Path
) -> None:
    from muxtower.asr.service import BASE_PROMPT
    from muxtower.sessions.models import CreateSession

    assert AsrService(FakeTranscriber(), None).prompt() == BASE_PROMPT
    long_extra = AsrService(FakeTranscriber(), None, extra_prompt="词" * 400).prompt()  # three bytes each
    assert len(long_extra.encode()) <= 896 and long_extra.startswith(BASE_PROMPT)  # Groq counts bytes
    app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="private-project"))
    fake = FakeTranscriber()
    app.state.asr = AsrService(fake, language=None)
    client, auth = _client(app)
    client.post("/v1/asr", content=WAV, headers={**auth, "Content-Type": "audio/wav"})
    assert fake.prompts == [BASE_PROMPT]  # no session's name ever goes to the provider


def test_a_browser_recording_is_named_by_its_format(monkeypatch: pytest.MonkeyPatch) -> None:
    names: list[str] = []

    def answer(*_: object, files: dict[str, tuple[str, bytes, str]], **__: object) -> httpx.Response:
        names.append(files["file"][0])
        return httpx.Response(200, json={"text": "ok"})

    monkeypatch.setattr(httpx, "post", answer)
    for kind in ("audio/webm", "audio/mp4", "audio/wav"):
        OpenAICompatibleTranscriber("groq", "k").transcribe(WAV, kind, None, None)
    assert names == ["speech.webm", "speech.mp4", "speech.wav"]  # the provider tells the format by it


def test_summary_route_and_reply_summary(make_app: Callable[..., FastAPI]) -> None:
    app = make_app()
    client, auth = _client(app)
    assert client.post("/v1/sessions/nope/summary", headers=auth).status_code == 404


def test_a_source_is_kept_in_the_audit_for_counts(app: FastAPI) -> None:
    app.state.asr = AsrService(FakeTranscriber(), language=None)
    client, auth = _client(app)
    res = client.post("/v1/asr?source=live", content=WAV, headers={**auth, "Content-Type": "audio/wav"})
    assert res.status_code == 200
    with app.state.audit.db.connect() as conn:
        detail = conn.execute("SELECT detail FROM audit_log WHERE action = 'asr'").fetchone()[0]
    assert detail.endswith(" source=live")
    assert (
        client.post("/v1/asr?source=../x", content=WAV, headers={**auth, "Content-Type": "audio/wav"}).status_code
        == 422
    )


def test_a_command_hint_uses_the_apps_command_words_and_the_configured_language_first(app: FastAPI) -> None:
    fake = FakeTranscriber()
    app.state.asr = AsrService(fake, language=None)
    client, auth = _client(app)
    asked = "/v1/asr?hint=command&language=fr&words=envoyer&words=pause&words=send"
    res = client.post(asked, content=WAV, headers={**auth, "Content-Type": "audio/wav"})
    assert res.json()["language"] == "fr" and fake.calls[-1][2] == "fr" and fake.prompts[-1] == "envoyer pause send"
    client.post("/v1/asr?hint=command", content=WAV, headers={**auth, "Content-Type": "audio/wav"})
    assert fake.prompts[-1] == "send pause resume clear undo"  # no words given: the English ones
    app.state.asr = AsrService(fake, language="en")  # configured: it wins for a command
    res = client.post(asked, content=WAV, headers={**auth, "Content-Type": "audio/wav"})
    assert res.json()["language"] == "en" and fake.calls[-1][2] == "en"
    client.post("/v1/asr", content=WAV, headers={**auth, "Content-Type": "audio/wav"})  # no hint: as before
    assert fake.prompts[-1].startswith(BASE_PROMPT)
