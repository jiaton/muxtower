"""Live listening: a listened session's turn, when it ends, said in a few spoken words by one stateless
summarizer call with bounded, rolling context; nothing for sessions nobody listens to, nothing said twice,
at most so many a day; the target goes with the phone's connection."""

from collections.abc import Callable
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.config import DEFAULT_LISTEN_PROMPT
from muxtower.listen.service import ListenService, instructions
from muxtower.runtimes.models import AgentState
from muxtower.sessions.models import ConversationItem, ConversationItemKind, StateSource


class Summarizer:
    def __init__(self) -> None:
        self.asked: list[tuple[str, str]] = []

    def summarize(self, instructions: str, text: str) -> str:
        self.asked.append((instructions, text))
        return f"说法 {len(self.asked)}"


class Directory:
    def __init__(self) -> None:
        self.session = SimpleNamespace(
            id="s1", name="web-app", team_role="worker", project="acme/web", state=AgentState.BUSY,
            state_source=StateSource.HOOK, last_message="old reply", needs_attention=False, pending=None,
        )  # fmt: skip
        self.items: list[ConversationItem] = []

    def find(self, sid: str) -> Any:
        return self.session if sid == "s1" else None

    def conversation(self, sid: str, after: int, limit: int) -> Any:
        return SimpleNamespace(items=self.items)

    def turn(self, prompt: str, reply: str) -> None:
        at = datetime.now(UTC)
        n = len(self.items) + 1
        self.items += [
            ConversationItem(seq=n * 10, at=at, kind=ConversationItemKind.PROMPT, text=prompt),
            ConversationItem(seq=n * 10 + 1, at=at, kind=ConversationItemKind.REPLY, text=reply),
        ]
        self.session.last_message = reply
        self.session.state = AgentState.IDLE


def _service(d: Directory, s: Summarizer | None, rounds: int = 3, cap: int = 100) -> ListenService:
    return ListenService(d, lambda: s, lambda: rounds, lambda: cap)


def test_a_listened_turn_is_said_once_from_its_context_and_what_came_before_is_not_read_again() -> None:
    d, s = Directory(), Summarizer()
    listen = _service(d, s, rounds=2)
    assert listen.due(0) == []  # nobody listens
    listen.listen("s1")
    d.session.state = AgentState.IDLE
    assert listen.due(10) == []  # the reply there when listening began is not news
    for i in range(4):
        d.session.state = AgentState.BUSY
        listen.due(20 + i * 10)
        d.turn(f"prompt {i}", f"reply {i}")
        assert listen.due(21 + i * 10) == []  # just idle: settling
        assert listen.due(22 + i * 10) == ["s1"]  # a hook said so: half a second will do
        frame = listen.speak("s1")
        assert frame is not None and frame.text == f"说法 {i + 1}" and frame.reply == f"reply {i}"
        assert listen.due(23 + i * 10) == []  # said once
    instructions, text = s.asked[-1]
    assert instructions == DEFAULT_LISTEN_PROMPT.replace(
        "{language}", "the language the assistant's reply is written in"
    )
    assert "Session: web-app · role worker · project acme/web" in text
    assert "User: prompt 3" in text and "Assistant's reply: reply 3" in text
    assert "User: prompt 2" in text and "Said: 说法 3" in text and "User: prompt 1" in text
    assert "prompt 0" not in text  # two earlier rounds, as set
    assert "reply 2" not in text  # earlier replies stand in by what was said of them


def test_a_reply_read_off_a_screen_settles_longer_and_one_waiting_on_the_owner_at_once() -> None:
    d = Directory()
    listen = _service(d, Summarizer())
    listen.listen("s1")
    d.session.state_source = StateSource.SCREEN
    d.turn("go", "done")
    assert listen.due(0) == [] and listen.due(2) == [] and listen.due(4.5) == ["s1"]
    d.turn("again", "which one?")
    d.session.needs_attention = True
    d.session.pending = SimpleNamespace(tool_name="Bash", detail="rm -rf build", options=[SimpleNamespace(label="Yes")])
    assert listen.due(10) == ["s1"]
    assert "Waiting for: Bash rm -rf build Options: Yes" in (listen.context("s1") or ("",))[0]


def test_a_daily_cap_and_no_summarizer_are_said_once() -> None:
    d, s = Directory(), Summarizer()
    listen = _service(d, s, cap=1)
    listen.listen("s1")
    d.turn("a", "b")
    assert (listen.speak("s1") or SimpleNamespace(text=None)).text == "说法 1"
    capped = listen.speak("s1")
    assert capped is not None and capped.error == "limit" and capped.reply == "b"
    assert listen.speak("s1") is None  # said once a day
    assert len(s.asked) == 1
    none = _service(d, None).speak("s1")
    assert none is not None and none.error == "unavailable"


def test_the_phone_listens_by_subscribing_and_stops_when_it_goes(make_app: Callable[..., FastAPI]) -> None:
    app = make_app()
    _, token = app.state.tokens.create("phone")
    client = TestClient(app)
    with client.websocket_connect("/v1/stream", subprotocols=["muxtower", f"bearer.{token}"]) as ws:
        ws.send_json({"type": "subscribe", "topic": "spoken", "session_id": "abc"})
        ws.send_json({"type": "ping"})
        ws.receive_json()
        assert app.state.listen.listening() == ["abc"]
        ws.send_json({"type": "subscribe", "topic": "spoken", "session_id": "abc"})  # twice: one listener
        ws.send_json({"type": "ping"})
        ws.receive_json()
        assert app.state.listen._listened["abc"].phones == 1
    assert app.state.listen.listening() == []  # its connection gone: no one listens


def test_play_always_has_the_latest_reply_s_summary_kept_or_made_now() -> None:
    d, s = Directory(), Summarizer()
    listen = _service(d, s, cap=10)
    d.turn("first", "reply one")
    first = listen.latest("s1")  # nobody listened when it ended: made now, on asking
    assert first is not None and getattr(first, "text", None) == "说法 1"
    assert listen.latest("s1") is first and len(s.asked) == 1  # kept: not made twice
    listen.listen("s1")
    d.turn("second", "reply two")
    listen.due(100)
    assert listen.due(101) == ["s1"]
    listen.speak("s1")  # said while it was listened to (the phone maybe away): kept
    assert [k.text for k in listen.kept("s1")] == ["说法 1", "说法 2"]
    assert listen.latest("s1") is listen.kept("s1")[-1] and len(s.asked) == 2
    for i in range(6):
        d.turn(f"p{i}", f"r{i}")
        listen.latest("s1")
    assert len(listen.kept("s1", 5)) == 5  # the last five


def test_play_s_routes(make_app: Callable[..., FastAPI]) -> None:
    app = make_app()
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}
    client = TestClient(app)
    assert client.get("/v1/sessions/nope/spoken", headers=auth).json() == []
    assert client.post("/v1/sessions/nope/spoken", headers=auth).status_code == 404


def test_a_summary_is_voiced_as_soon_as_it_is_made_when_the_hub_has_a_voice() -> None:
    d, s = Directory(), Summarizer()
    listen = _service(d, s)
    voiced: list[str] = []
    listen.tts = SimpleNamespace(why_not=lambda: None, speak=lambda text, language=None: voiced.append(text) or b"mp3")
    d.turn("go", "done")
    listen.speak("s1")
    assert voiced == ["说法 1"]  # ready in the cache before the phone asks
    listen.tts = SimpleNamespace(why_not=lambda: "off", speak=lambda text: voiced.append(text))
    d.turn("again", "done again")
    listen.speak("s1")
    assert voiced == ["说法 1"]  # off: nothing made


def test_it_speaks_the_language_set_or_each_reply_s_own_and_takes_another_prompt() -> None:
    from muxtower.listen.language import detect

    replies = ("修好了测试", "テストを直しました", "테스트를 고쳤어요", "Fixed the test", "PR 212 的 CI 挂了")
    assert [detect(t) for t in replies] == ["zh", "ja", "ko", "en", "zh"]
    d, s = Directory(), Summarizer()
    auto = _service(d, s)
    d.turn("fix it", "I fixed the flaky test and pushed it.")
    frame = auto.speak("s1")
    assert frame is not None and frame.language == "en"
    assert "the language the assistant's reply is written in" in s.asked[-1][0]  # auto: the reply's own
    d.turn("修一下", "测试修好了，已经推上去了。")
    assert (auto.speak("s1") or frame).language == "zh"
    fixed = ListenService(d, lambda: s, lambda: 3, lambda: 100, lambda: "zh", lambda: "Say it in {language}, briefly.")
    d.turn("fix it", "Done, all green.")
    assert (fixed.speak("s1") or frame).language == "zh"  # set: whatever the reply is in
    assert s.asked[-1][0] == "Say it in Chinese (Mandarin, simplified), briefly."  # the prompt set, its placeholder
    assert instructions(DEFAULT_LISTEN_PROMPT, "ja").startswith("Summarise the assistant's last turn")
    assert "主人" not in DEFAULT_LISTEN_PROMPT and "driv" not in DEFAULT_LISTEN_PROMPT
