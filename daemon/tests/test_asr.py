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
    app.state.asr = AsrService(fake, language="zh", hints=lambda: ["immich 上传", "lyric", "lyric"])
    client, auth = _client(app)
    res = client.post("/v1/asr", content=WAV, headers={**auth, "Content-Type": "audio/wav"})
    assert res.json() == {"text": "继续，然后跑测试"}
    assert fake.calls == [(len(WAV), "audio/wav", "zh")]
    assert "简体中文" in fake.prompts[0] and fake.prompts[0].endswith("会话：immich 上传、lyric")
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
