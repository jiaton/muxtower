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


def test_a_side_chat_of_a_compacted_session_finds_it_by_its_title() -> None:
    """The copy starts after the parent's summary, so its first message is not the parent's first."""
    port = FakeRemoteControl()
    port.sessions = [
        session("cse_main", title="Delivery ETA", created_at="2026-10-07T22:52:21Z"),
        session("cse_older", title="Delivery ETA", created_at="2026-10-01T10:00:00Z"),
        session("cse_side", title="Delivery ETA", created_at="2026-10-28T21:30:00Z"),
    ]
    burst = "2026-10-28T21:30:01.156Z"
    port.events = {
        "cse_main": history(),
        "cse_older": [say(1, "2026-10-01T10:00:01Z", "user", "x1"), say(2, "2026-10-01T10:00:09Z", "assistant", "x2")],
        "cse_side": [
            say(1, burst, "user", "c1", "This session is being continued…"),
            say(2, burst, "assistant", "c2"),
            say(3, "2026-10-28T21:30:01.414Z", "user", "n1", SIDE_NOTE),
        ],  # fmt: skip
    }
    views = {v.id: (v.fork_of, v.side_chat) for v in source(port).views()}
    assert views["cse_side"] == ("cse_main", True)  # the newest older one with its title


def test_a_long_copy_written_in_batches_is_still_one_copy() -> None:
    """The app writes a long copy a hundred events at a time, each batch a moment after the last."""
    port = FakeRemoteControl()
    port.sessions = [
        session("cse_main", title="Report", created_at="2026-10-29T20:21:09Z"),
        session("cse_side", title="Report", created_at="2026-10-29T22:54:02Z"),
    ]
    first, second = "2026-10-29T22:54:03.087600Z", "2026-10-29T22:54:03.554612Z"
    port.events = {
        "cse_main": history(),
        "cse_side": [
            *history(first),
            say(4, second, "assistant", "a2"),
            say(5, second, "user", "u3"),
            say(6, "2026-10-29T22:54:03.904324Z", "user", "n1", SIDE_NOTE),
            say(7, "2026-10-29T22:54:09Z", "assistant", "s1"),
        ],
    }
    views = {v.id: (v.fork_of, v.side_chat) for v in source(port).views()}
    assert views["cse_side"] == ("cse_main", True)


def test_a_desktop_fork_from_the_middle_of_a_session_is_found_by_its_first_message() -> None:
    """Claude desktop's fork has no tag; made from a message deep in the parent, its copy starts there."""
    port = FakeRemoteControl()
    port.sessions = [
        session("cse_parent", title="Plan the launch", created_at="2026-10-20T10:00:00Z"),
        session("cse_decoy", title="Plan the launch", created_at="2026-10-22T10:00:00Z"),
        session("cse_fork", title="Plan the launch", created_at="2026-10-25T09:00:00Z"),
    ]
    burst = "2026-10-25T09:00:01.500Z"
    port.events = {
        "cse_parent": [
            *history(),
            say(314, "2026-10-21T08:00:00Z", "user", "m314", "Where were we on the offer?"),
            say(315, "2026-10-21T08:00:09Z", "assistant", "m315"),
        ],
        "cse_decoy": [say(1, "2026-10-22T10:00:01Z", "user", "d1"), say(2, "2026-10-22T10:00:07Z", "assistant", "d2")],
        "cse_fork": [
            say(1, burst, "user", "m314", "Where were we on the offer?"),
            say(2, burst, "assistant", "m315"),
            say(3, "2026-10-25T09:00:20Z", "user", "f1"),
            say(4, "2026-10-25T09:00:30Z", "assistant", "f2"),
        ],
    }
    src = source(port)
    views = {v.id: (v.fork_of, v.side_chat) for v in src.views()}
    assert views == {"cse_parent": (None, False), "cse_decoy": (None, False), "cse_fork": ("cse_parent", False)}
    read: list[str] = []
    events_after = port.events_after
    port.events_after = lambda sid, after, limit: read.append(sid) or events_after(sid, after, limit)  # type: ignore[method-assign]
    port.sessions[0]["updated_at"] = "2026-10-25T09:05:00Z"  # something changed: a tick reads again
    src.tick()
    assert src.get("cse_fork").fork_of == "cse_parent"
    assert "cse_decoy" not in read  # searched once, kept with its lineage


def test_an_equal_title_alone_does_not_make_a_parent() -> None:
    port = FakeRemoteControl()
    port.sessions = [
        session("cse_other", title="Plan the launch", created_at="2026-10-20T10:00:00Z"),
        session("cse_fork", title="Plan the launch", created_at="2026-10-25T09:00:00Z"),
    ]
    burst = "2026-10-25T09:00:01.500Z"
    port.events = {
        "cse_other": history(),
        "cse_fork": [
            say(1, burst, "user", "m314"),
            say(2, burst, "assistant", "m315"),
            say(3, "2026-10-25T09:00:20Z", "user", "f1"),
        ],
    }
    assert {v.id: v.fork_of for v in source(port).views()} == {"cse_other": None, "cse_fork": None}
