"""The voice dictionary: words for speech to text's prompt (within what Whisper reads of it), and corrections
of what it writes. Made-up words only."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.asr.dictionary import TOKEN_BUDGET, Correction, Dictionary, corrected, prompt_with, tokens
from muxtower.asr.service import BASE_PROMPT, AsrService
from tests.test_asr import WAV, FakeTranscriber


def rules(*pairs: tuple[str, str]) -> list[Correction]:
    return [Correction(heard=h, write=w) for h, w in pairs]


def test_the_words_end_the_prompt_as_many_as_fit_and_the_rest_is_cut_from_its_start() -> None:
    prompt, held = prompt_with(BASE_PROMPT, ["acme-cli", "Zorbit", "quuxdb"])
    assert prompt == f"{BASE_PROMPT} Vocabulary: acme-cli, Zorbit, quuxdb." and held == 3
    many = [f"term{i}x" for i in range(400)]
    prompt, held = prompt_with("guidance " * 300, many)
    assert 0 < held < 400 and tokens(prompt) <= TOKEN_BUDGET and len(prompt.encode()) <= 880
    assert prompt.endswith(f"term{held - 1}x.") and not prompt.startswith("guidance guidance guidance" * 50)
    cjk, held = prompt_with("说明" * 400, ["acme-cli"])  # three bytes and up to two tokens a character
    assert held == 1 and tokens(cjk) <= TOKEN_BUDGET and cjk.endswith("Vocabulary: acme-cli.")


def test_corrections_whole_words_case_aside_in_order_once_each_and_literal() -> None:
    assert (
        corrected("open .acme and the .Acme folder", rules((".acme", "acme-cli")))
        == "open acme-cli and the acme-cli folder"
    )
    assert (
        corrected("Zorbit, zorbits and ZORBIT", rules(("zorbit", "Zorbit"))) == "Zorbit, zorbits and Zorbit"
    )  # not inside a word
    assert corrected("run mux  tower now", rules(("mux tower", "muxtower"))) == "run muxtower now"  # any spaces
    assert corrected("a b", rules(("a", "b"), ("b", "c"))) == "b c"  # each part once: no chains
    assert corrected("quux db", rules(("quux db", "quuxdb"), ("quux", "Q"))) == "quuxdb"  # the earlier wins
    assert corrected("cost 5", rules(("cost", r"\1$&"))) == r"\1$& 5"  # literal
    assert corrected("请打开测试仓库", rules(("测试仓库", "test-repo"))) == "请打开test-repo"  # CJK: no word bounds
    assert corrected("um so ok", rules(("um", ""))) == "so ok"  # dropped, spaces tidied


def test_the_dictionary_is_kept_and_used_by_speech_to_text(app: FastAPI) -> None:
    fake = FakeTranscriber()
    fake.transcribe = lambda audio, kind, language, prompt: (
        fake.prompts.append(prompt or ""),
        "open .acme with zorbit",
    )[1]  # type: ignore[method-assign]
    service = AsrService(fake, language=None)
    service.dictionary = app.state.asr_dictionary.load
    app.state.asr = service
    _, token = app.state.tokens.create("phone")
    client, auth = TestClient(app), {"Authorization": f"Bearer {token}"}
    assert client.get("/v1/asr/dictionary", headers=auth).json()["words"] == []
    body = {
        "words": ["acme-cli", "Zorbit", "acme-cli"],
        "corrections": [{"heard": ".acme", "write": "acme-cli"}, {"heard": "zorbit", "write": "Zorbit"}],
    }
    saved = client.put("/v1/asr/dictionary", json=body, headers=auth).json()
    assert saved["words"] == ["acme-cli", "Zorbit"]  # each once
    assert saved["fit"] == {"words_in_prompt": 2, "words": 2, "tokens": saved["fit"]["tokens"], "budget": TOKEN_BUDGET}
    said = client.post("/v1/asr", content=WAV, headers={**auth, "Content-Type": "audio/wav"}).json()
    assert said["text"] == "open acme-cli with Zorbit"  # corrected, for every client
    assert fake.prompts[-1].endswith("Vocabulary: acme-cli, Zorbit.")
    assert client.get("/v1/asr/dictionary", headers=auth).json()["corrections"][0] == {
        "heard": ".acme",
        "write": "acme-cli",
    }


@pytest.mark.parametrize(
    "bad", [{"words": ["x" * 81]}, {"words": [" "]}, {"corrections": [{"heard": " ", "write": "x"}]}]
)
def test_a_bad_dictionary_is_refused(app: FastAPI, bad: dict[str, object]) -> None:
    _, token = app.state.tokens.create("phone")
    res = TestClient(app).put("/v1/asr/dictionary", json=bad, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code in (400, 422)
    assert Dictionary().words == []


def test_it_needs_a_device_token(app: FastAPI) -> None:
    assert TestClient(app).get("/v1/asr/dictionary").status_code == 401
