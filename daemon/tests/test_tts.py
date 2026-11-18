"""The hub's voice for Read aloud: Azure's REST API (faked here: no real key in tests), mp3 made once per
text and voice and kept within a bound, characters counted per month against a soft cap, and every way it
cannot say something (off, no key, cap, quota, a refused key, slow) told, so the phone speaks instead."""

from collections.abc import Callable
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.config import TtsSettings
from muxtower.tts.service import AzureSpeech, Refused, TtsService, ssml


class FakeAzure:
    def __init__(self) -> None:
        self.asked: list[tuple[str, str, str]] = []
        self.refuse: str | None = None

    def synthesize(self, body: str, key: str, region: str) -> bytes:
        if self.refuse:
            raise Refused(self.refuse)
        self.asked.append((body, key, region))
        return b"ID3" + body.encode()[-20:]


def _service(tmp_path: Path, **over: object) -> tuple[TtsService, FakeAzure, TtsSettings]:
    base: dict[str, object] = {"provider": "azure", "api_key": "test-key-not-real", "region": "westus2"}
    settings = TtsSettings(**{**base, **over})  # type: ignore[arg-type]
    fake = FakeAzure()
    return TtsService(lambda: settings, tmp_path, fake, cache_bytes=200), fake, settings


def test_ssml_names_the_voice_escapes_the_text_and_takes_a_style() -> None:
    said = ssml("PR 212 <ok> & done", "zh-CN-XiaoxiaoNeural", "chat")
    assert 'xml:lang="zh-CN"' in said and '<voice name="zh-CN-XiaoxiaoNeural">' in said
    assert '<mstts:express-as style="chat">PR 212 &lt;ok&gt; &amp; done</mstts:express-as>' in said
    assert "express-as" not in ssml("hi", "zh-CN-YunxiNeural")


def test_said_once_kept_and_counted(tmp_path: Path) -> None:
    tts, fake, _ = _service(tmp_path)
    audio = tts.speak("部署好了")
    assert audio.startswith(b"ID3") and len(fake.asked) == 1 and fake.asked[0][1:] == ("test-key-not-real", "westus2")
    assert tts.speak("部署好了") == audio and len(fake.asked) == 1  # kept: not asked again, not counted again
    assert tts.status().characters == 4
    tts.speak("部署好了", voice="zh-CN-YunxiNeural")  # another voice: another one
    assert len(fake.asked) == 2 and tts.status().characters == 8
    for i in range(20):
        tts.speak(f"第{i}句")
    assert sum(p.stat().st_size for p in (tmp_path / "tts-cache").glob("*.mp3")) <= 200  # bounded


def test_every_way_it_cannot_is_said(tmp_path: Path) -> None:
    off, _, _ = _service(tmp_path / "a", provider="off")
    assert off.status().why_not == "off" and not off.status().available
    with pytest.raises(Refused, match="off"):
        off.speak("x")
    nokey = TtsService(lambda: TtsSettings(provider="azure"), tmp_path / "b", FakeAzure())
    assert nokey.status().why_not == "key" and nokey.status().key_present is False
    capped, fake, _ = _service(tmp_path / "c", monthly_soft_cap=5)
    capped.speak("一二三四五")
    assert capped.status().why_not == "cap"
    with pytest.raises(Refused, match="cap"):
        capped.speak("六")
    assert capped.speak("一二三四五")  # what is kept is still said
    quota, fake, _ = _service(tmp_path / "d")
    fake.refuse = "quota"  # Azure's 429
    with pytest.raises(Refused, match="quota"):
        quota.speak("x")
    assert quota.status().why_not == "quota"  # believed a while: not asked again at once


def test_azure_s_answers_mapped(monkeypatch: pytest.MonkeyPatch) -> None:
    def answer(status: int) -> Callable[..., httpx.Response]:
        return lambda *a, **k: httpx.Response(status, content=b"mp3!")

    for status, why in ((429, "quota"), (401, "key"), (403, "key"), (500, "failed")):
        monkeypatch.setattr(httpx, "post", answer(status))
        with pytest.raises(Refused) as refused:
            AzureSpeech().synthesize("<speak/>", "k", "eastus")
        assert refused.value.why == why

    def slow(*a: object, **k: object) -> httpx.Response:
        raise httpx.ReadTimeout("slow")

    monkeypatch.setattr(httpx, "post", slow)
    with pytest.raises(Refused) as refused:
        AzureSpeech().synthesize("<speak/>", "k", "eastus")
    assert refused.value.why == "timeout"
    monkeypatch.setattr(httpx, "post", answer(200))
    assert AzureSpeech().synthesize("<speak/>", "k", "eastus") == b"mp3!"


def test_routes_off_by_default_and_never_showing_the_key(make_app: Callable[..., FastAPI]) -> None:
    app = make_app()
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}
    client = TestClient(app)
    status = client.get("/v1/tts", headers=auth).json()
    assert status["provider"] == "off" and status["why_not"] == "off" and status["free_tier"] == 500_000
    assert "zh-CN-XiaoxiaoNeural" in status["voices"] and "api_key" not in status
    assert client.post("/v1/tts", json={"text": "你好"}, headers=auth).status_code == 503
    app.state.tts.settings = lambda: TtsSettings(provider="azure", api_key="test-key-not-real")
    app.state.tts.client = FakeAzure()
    res = client.post("/v1/tts", json={"text": "你好", "voice": "zh-CN-YunxiNeural"}, headers=auth)
    assert res.status_code == 200 and res.headers["content-type"] == "audio/mpeg"
    assert "test-key-not-real" not in client.get("/v1/tts", headers=auth).text


def test_the_voice_follows_the_language_unless_one_is_set(tmp_path: Path) -> None:
    from muxtower.tts.service import voice_for

    assert voice_for("", "zh") == "zh-CN-XiaoxiaoNeural"
    assert voice_for("", "en") == "en-US-AvaMultilingualNeural"
    assert voice_for("", "sv") == "en-US-AvaMultilingualNeural"  # any other: a voice that speaks any
    assert voice_for("zh-CN-YunxiNeural", "en") == "zh-CN-YunxiNeural"  # the one set wins
    tts, fake, _ = _service(tmp_path, voice="")
    tts.speak("Fixed it.", language="en")
    tts.speak("修好了。", language="zh")
    assert ['name="en-US-AvaMultilingualNeural"' in b for b, _, _ in fake.asked] == [True, False]
    assert 'name="zh-CN-XiaoxiaoNeural"' in fake.asked[1][0] and 'xml:lang="zh-CN"' in fake.asked[1][0]
    assert tts.status().voice_for["en"] == "en-US-AvaMultilingualNeural"
