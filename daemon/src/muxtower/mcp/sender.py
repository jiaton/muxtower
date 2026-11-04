"""Who a message `send_message` types into a session is from, said at its head, so the receiver can tell
a teammate's words from the owner's own (who types in the app or the terminal, never headed). The head is
added here, from the caller's identity: what the text says of its sender is not believed.

Left without a head, as the receiver must get it exactly (and still audited, with the sender): a slash
command on one line (`/compact`), and an answer to what the session asks right now (it waits on a prompt,
or the text is exactly one of the replies its next step offers)."""

import re
from collections.abc import Iterable

HEAD = "[muxtower message from"
# A head the text brings itself (pasted, relayed or made up): dropped, the real one is put first.
BROUGHT = re.compile(r"^(?:\[muxtower (?:message|task) from [^\]\n]*\][ \t]*\n?)+")
SLASH = re.compile(r"^/[A-Za-z][\w:-]*(?: [^\n]*)?$")


def sender_label(name: str | None, role: str | None, session_id: str | None, device: str) -> str:
    if session_id is None:
        return f"{device} (a device, not a session)"
    return f"{name or session_id} ({role or 'no role'}) · {session_id}"


def headed(text: str, label: str, waiting: bool, replies: Iterable[str]) -> str:
    """The text as typed into the session: headed with who sent it, unless it must arrive as it is."""
    body = BROUGHT.sub("", text) or text
    if SLASH.match(text.strip()) or waiting or text.strip() in {r.strip() for r in replies}:
        return text
    return f"{HEAD} {label}]\n{body}"
