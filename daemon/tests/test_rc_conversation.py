from muxtower.sessions.models import ConversationItemKind as K
from muxtower.sources.remote_control.conversation import ConversationBuilder
from tests.rc_fakes import answered, assistant, permission, tool_result, user


def test_prompt_reply_and_tool_lifecycle() -> None:
    b = ConversationBuilder()
    call = {"type": "tool_use", "id": "t1", "name": "Bash", "input": {"command": "make"}}
    b.feed([user(1, "fix the build"), assistant(2, {"type": "text", "text": "Looking."}, call)])
    changed = b.feed([tool_result(3, "t1")])
    kinds = [(i.kind, i.text, i.status) for i in b.after(0, 10)]
    assert kinds == [
        (K.PROMPT, "fix the build", None),
        (K.REPLY, "Looking.", None),
        (K.TOOL, "make", "done"),
    ]
    assert [i.kind for i in changed] == [K.TOOL]  # the finished tool is re-sent with its new status
    assert b.last_reply == "Looking."


def test_injected_context_is_not_a_prompt_and_duplicates_are_ignored() -> None:
    b = ConversationBuilder()
    b.feed([user(1, "<system-reminder>internal</system-reminder>"), user(2, "/compact")])
    b.feed([user(2, "/compact")])
    assert [i.text for i in b.after(0, 10)] == ["/compact"]


def test_permission_prompt_until_answered() -> None:
    b = ConversationBuilder()
    b.feed([permission(5, "r1", "Bash", {"command": "rm -rf build"})])
    assert b.pending and b.pending.tool_name == "Bash"
    assert b.after(0, 10)[0].status == "pending"
    changed = b.feed([answered(6, "r1", "deny")])
    assert b.pending is None and changed[0].status == "denied"


def test_question_answered() -> None:
    b = ConversationBuilder()
    questions = {"questions": [{"question": "Which DB?", "options": [{"label": "SQLite"}, {"label": "Postgres"}]}]}
    b.feed([permission(7, "q1", "AskUserQuestion", questions)])
    assert b.pending and b.pending.is_question
    assert b.after(0, 10)[0].kind == K.QUESTION
    b.feed([answered(8, "q1", answers={"Which DB?": "SQLite"})])
    assert b.after(0, 10)[0].status == "answered"
