"""Forks and side chats told apart from the sessions they came from: a fork by its tags, a side chat by
its start (a copy of its parent's history, same message ids, written at once) and the note in it."""

from typing import Any

from muxtower.sources.remote_control.ports import RawEvent
from muxtower.sources.remote_control.service import RemoteControlSource
from tests.rc_fakes import FakeRemoteControl, session

SIDE_NOTE = (
    "<system-reminder> ## The user forked this session from another session The user forked this session at "
    "this point to ask something on the side; continue from here on whatever they ask.</system-reminder>"
)


def say(seq: int, at: str, kind: str, uid: str, text: str = "…") -> RawEvent:
    payload: dict[str, Any] = {
        "type": kind,
        "uuid": uid,
        "message": {"role": kind, "content": [{"type": "text", "text": text}]},
    }
    return RawEvent(seq, at, "worker", payload)


def history(at: str | None = None) -> list[RawEvent]:
    """The owner's first exchange: written over time, or (a copy) all at one instant."""
    times = [at or t for t in ("2026-10-28T20:10:46.281Z", "2026-10-28T20:10:58.641Z", "2026-10-28T20:12:50.000Z")]
    return [
        say(1, times[0], "user", "u1", "Travel?"),
        say(2, times[1], "assistant", "a1"),
        say(3, times[2], "user", "u2"),
    ]


def source(port: FakeRemoteControl) -> RemoteControlSource:
    src = RemoteControlSource(port, {})
    src.tick()
    return src


def test_a_side_chat_is_folded_under_the_session_it_was_asked_beside() -> None:
    port = FakeRemoteControl()
    port.sessions = [
        session("cse_main", title="Travel", created_at="2026-10-28T20:10:45Z"),
        session("cse_side", title="Travel", created_at="2026-10-28T20:19:47Z"),
        session("cse_other", title="Other", created_at="2026-10-28T20:00:00Z"),
    ]
    burst = "2026-10-28T20:19:48.378Z"
    port.events = {
        "cse_main": history(),
        "cse_side": [
            *history(burst),
            say(4, burst, "user", "n1", SIDE_NOTE),
            say(5, "2026-10-28T20:19:52Z", "assistant", "s1"),
        ],
        "cse_other": [say(1, "2026-10-28T20:00:01Z", "user", "o1"), say(2, "2026-10-28T20:00:01Z", "system", "x")],
    }
    views = {v.id: (v.fork_of, v.side_chat) for v in source(port).views()}
    assert views == {"cse_main": (None, False), "cse_side": ("cse_main", True), "cse_other": (None, False)}


def test_a_copy_without_the_note_is_a_fork_and_a_tagged_fork_names_its_parent() -> None:
    port = FakeRemoteControl()
    tags = ["remote-control-fork", "remote-control-fork-parent:session_013abc"]
    port.sessions = [
        session("cse_main", created_at="2026-10-28T20:10:45Z"),
        session("cse_copy", created_at="2026-10-28T20:30:00Z"),
        session("cse_cli", tags=tags),
    ]
    port.events = {"cse_main": history(), "cse_copy": history("2026-10-28T20:30:01.000Z"), "cse_cli": history()}
    src = source(port)
    views = {v.id: (v.fork_of, v.side_chat) for v in src.views()}
    assert views == {"cse_main": (None, False), "cse_copy": ("cse_main", False), "cse_cli": ("cse_013abc", False)}
    assert src.get("cse_copy").fork_of == "cse_main"
