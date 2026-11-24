"""A controller's message Claude Code has not taken in yet (the desktop app holds one from muxtower for
Deny or Deliver): its prompt is pending until a reply names it, or until Claude Code writes it again as its
own once delivered, which is the same message, shown once."""

from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.claude_conversation import ConversationBuilder, RawEvent
from muxtower.sessions.models import ConversationItemKind as K
from muxtower.sessions.models import ItemStatus


def sent(seq: int, text: str, at: str, uuid: str) -> RawEvent:
    """A message from a controller (muxtower, an app), as Remote Control records it."""
    message = {"role": "user", "content": [{"type": "text", "text": text}]}
    return RawEvent(seq, at, "client", {"type": "user", "uuid": uuid, "message": message})


def again(seq: int, text: str, at: str, uuid: str) -> RawEvent:
    """Claude Code writing a delivered message again, as its own."""
    payload = {"type": "user", "uuid": uuid, "origin": {"kind": "human"}, "message": {"role": "user", "content": text}}
    return RawEvent(seq, at, "worker", payload)


def reply(seq: int, text: str, at: str, *answers: str, **extra: Any) -> RawEvent:
    message = {"role": "assistant", "content": [{"type": "text", "text": text}]}
    payload: dict[str, Any] = {"type": "assistant", "message": message}
    if answers:
        payload["user_message_uuids"] = list(answers)
    payload.update(extra)
    return RawEvent(seq, at, "worker", payload)


def prompts(b: ConversationBuilder) -> list[tuple[str | None, ItemStatus | None]]:
    return [(i.text, i.status) for i in b.after(0, 50) if i.kind == K.PROMPT]


def test_a_sent_message_is_pending_until_a_reply_names_it() -> None:
    b = ConversationBuilder()
    b.feed([sent(1, "Plan the launch", "2026-01-05T10:00:00Z", "u1")])
    assert prompts(b) == [("Plan the launch", ItemStatus.PENDING)]
    changed = b.feed([reply(2, "On it.", "2026-01-05T10:00:03Z", "u1")])
    assert prompts(b) == [("Plan the launch", None)]
    assert [(i.kind, i.status) for i in changed] == [(K.PROMPT, None), (K.REPLY, None)]  # re-sent as taken in


def test_held_then_delivered_is_one_message_not_two() -> None:
    b = ConversationBuilder()
    b.feed([sent(1, "ok", "2026-01-05T10:00:00Z", "u1"), reply(2, "Earlier work.", "2026-01-05T10:00:01Z", "u0")])
    assert prompts(b) == [("ok", ItemStatus.PENDING)]  # a reply to something else does not take it in
    changed = b.feed([again(3, "ok", "2026-01-05T10:04:00Z", "u2"), reply(4, "Done.", "2026-01-05T10:04:05Z", "u2")])
    assert prompts(b) == [("ok", None)]  # the copy Claude Code wrote is folded into it
    assert [i.seq for i in changed if i.kind == K.PROMPT] == [1 * 16]


def test_only_the_first_copy_soon_after_is_folded() -> None:
    b = ConversationBuilder()
    b.feed([sent(1, "ok", "2026-01-05T10:00:00Z", "u1")])
    # Claude Code's own "ok" long after: a message of its own, and the held one still waits.
    b.feed([again(2, "ok", "2026-01-05T11:30:00Z", "u2")])
    assert prompts(b) == [("ok", ItemStatus.PENDING), ("ok", None)]
    b2 = ConversationBuilder()
    b2.feed([sent(1, "ok", "2026-01-05T10:00:00Z", "u1"), again(2, "ok", "2026-01-05T10:01:00Z", "u2")])
    b2.feed([again(3, "ok", "2026-01-05T10:02:00Z", "u3")])  # a second "ok", sent for real
    assert prompts(b2) == [("ok", None), ("ok", None)]


def test_different_words_are_never_folded() -> None:
    b = ConversationBuilder()
    b.feed([sent(1, "ship it", "2026-01-05T10:00:00Z", "u1"), again(2, "wait", "2026-01-05T10:00:05Z", "u2")])
    assert prompts(b) == [("ship it", ItemStatus.PENDING), ("wait", None)]


def test_a_claude_code_that_names_no_prompts_takes_them_in_at_its_reply() -> None:
    b = ConversationBuilder()
    b.feed([sent(1, "Plan the launch", "2026-01-05T10:00:00Z", "u1")])
    b.feed([reply(2, "On it.", "2026-01-05T10:00:03Z")])
    assert prompts(b) == [("Plan the launch", None)]


def test_once_replies_name_prompts_one_that_names_none_takes_none_in() -> None:
    b = ConversationBuilder()
    b.feed([sent(1, "first", "2026-01-05T10:00:00Z", "u1"), reply(2, "Yes.", "2026-01-05T10:00:01Z", "u1")])
    b.feed([sent(3, "second", "2026-01-05T10:05:00Z", "u3"), reply(4, "More of the first.", "2026-01-05T10:05:01Z")])
    assert prompts(b) == [("first", None), ("second", ItemStatus.PENDING)]


def test_a_failed_input_is_audited_with_status_and_size_only(
    app: FastAPI, client: TestClient, auth: dict[str, str]
) -> None:
    res = client.post("/v1/sessions/nope/input", json={"text": "Plan the launch", "enter": True}, headers=auth)
    assert res.status_code == 404
    with app.state.audit.db.connect() as conn:
        rows = conn.execute("SELECT action, session_id, detail FROM audit_log WHERE action LIKE 'input%'").fetchall()
    assert [tuple(r) for r in rows] == [("input failed", "nope", "status=404 text chars=15 enter=True")]
