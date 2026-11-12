"""Speech to text sometimes writes what was said twice in one transcript: it is written once. Made-up text."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.asr.repeats import unrepeated
from muxtower.asr.service import AsrService
from tests.test_asr import WAV, FakeTranscriber


@pytest.mark.parametrize(
    ("heard", "once"),
    [
        ("Run the tests, then deploy. Run the tests, then deploy.", "Run the tests, then deploy."),
        ("Run the tests then deploy run the tests then deploy", "Run the tests then deploy"),
        ("先跑测试再部署先跑测试再部署", "先跑测试再部署"),
        ("先跑测试再部署。先跑测试再部署。", "先跑测试再部署。"),
        ("Open the notes. Then tag it. Then tag it.", "Open the notes. Then tag it."),  # its last sentence again
        ("deploy deploy deploy", "deploy"),
    ],
)
def test_what_was_written_more_than_once_is_written_once(heard: str, once: str) -> None:
    assert unrepeated(heard) == once


@pytest.mark.parametrize(
    "said",
    [
        "no, no",  # too short to be sure it was not said so
        "Fix it. Fix it again.",
        "abcdabcd",  # no break between: one word
        "Ship the 2.4 notes, then the 2.4 post.",
        "",
    ],
)
def test_what_was_said_once_is_left_as_it_is(said: str) -> None:
    assert unrepeated(said) == said


def test_the_api_returns_a_doubled_transcript_once_then_corrected(app: FastAPI) -> None:
    fake = FakeTranscriber()
    fake.transcribe = lambda audio, kind, language, prompt: "open zorbit please open zorbit please"  # type: ignore[method-assign]
    service = AsrService(fake, language=None)
    service.dictionary = app.state.asr_dictionary.load
    app.state.asr = service
    _, token = app.state.tokens.create("phone")
    client, auth = TestClient(app), {"Authorization": f"Bearer {token}"}
    client.put(
        "/v1/asr/dictionary", json={"words": [], "corrections": [{"heard": "zorbit", "write": "Zorbit"}]}, headers=auth
    )
    said = client.post("/v1/asr", content=WAV, headers={**auth, "Content-Type": "audio/wav"}).json()
    assert said["text"] == "open Zorbit please"
