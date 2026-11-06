from collections.abc import Callable

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.asr.openai_compatible import OpenAICompatibleTranscriber
from muxtower.asr.service import AsrService
from muxtower.errors import Unavailable

WAV = b"RIFF" + b"\0" * 64


class FakeTranscriber:
    def __init__(self) -> None:
        self.calls: list[tuple[int, str, str | None]] = []
        self.prompts: list[str] = []

    def transcribe(self, audio: bytes, content_type: str, language: str | None, prompt: str | None) -> str:
        self.calls.append((len(audio), content_type, language))
        self.prompts.append(prompt or "")
        return "继续，然后跑测试"


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
    app.state.asr = AsrService(fake, language="zh", hints=lambda: ["Postgres", "notes", "notes"])
    client, auth = _client(app)
    res = client.post("/v1/asr", content=WAV, headers={**auth, "Content-Type": "audio/wav"})
    assert res.json() == {"text": "继续，然后跑测试"}
    assert fake.calls == [(len(WAV), "audio/wav", "zh")]
    assert "简体中文" in fake.prompts[0] and fake.prompts[0].endswith("会话：Postgres、notes")
    with app.state.audit.db.connect() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM audit_log WHERE action = 'asr'")]
    assert len(rows) == 1 and "继续" not in str(rows[0])
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


def test_the_prompt_fits_groqs_limit_in_bytes_with_whole_names() -> None:
    names = [f"会话名字{i} browser worker" for i in range(80)]  # Chinese: three bytes a character
    prompt = AsrService(FakeTranscriber(), None, hints=lambda: names, extra_prompt="额外的词").prompt()
    assert len(prompt.encode()) <= 896  # Groq counts the limit in bytes
    listed = prompt.split("会话：", 1)[1].split("、")
    assert listed == names[: len(listed)] and len(listed) > 3  # as many whole names as fit, in order
    long_extra = AsrService(FakeTranscriber(), None, hints=lambda: names, extra_prompt="词" * 400).prompt()
    assert len(long_extra.encode()) <= 896 and "会话：" not in long_extra  # no room: no names, no dangling label


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
