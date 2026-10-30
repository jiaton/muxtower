"""What a hub may do on this daemon (its node), by the method names of the link (`protocol.METHODS`):
the same as a device does through the API, on this daemon's own sessions. Blocking; run from a thread."""

import base64
from typing import Any

from pydantic import BaseModel

from muxtower.errors import Invalid
from muxtower.infra.audit import AuditLog
from muxtower.nodes.processes import report
from muxtower.sessions.archiving import Archiver
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.launcher import Launcher
from muxtower.sessions.models import CreateSession, UpdateSession
from muxtower.sessions.placement import Placements
from muxtower.sessions.ports import ClaudeProcessPort
from muxtower.terminal.models import Resize, SendInput


def _json(value: Any) -> Any:
    return value.model_dump(mode="json") if isinstance(value, BaseModel) else value


# What changes something here: audited as done by the hub, like a device's actions.
MUTATING = frozenset({"input", "approve", "deny", "update", "terminate", "archive", "create"})
# What changes the list here (as the same routes say for a device): the hub hears of it at once.
CHANGES_LIST = MUTATING | {"mark_read"}


class NodeApi:
    def __init__(
        self, directory: SessionDirectory, launcher: Launcher, archiver: Archiver, placements: Placements,
        audit: AuditLog, processes: ClaudeProcessPort,
    ) -> None:  # fmt: skip
        self.processes = processes
        self.directory = directory
        self.launcher = launcher
        self.archiver = archiver
        self.placements = placements
        self.audit = audit

    def sessions(self) -> list[dict[str, Any]]:
        """Everything it lists itself (not what its own nodes report: a node is no hub of the hub's)."""
        return [s.model_dump(mode="json") for s in self.directory.list() if s.node is None]

    def running(self) -> list[dict[str, Any]]:
        """Its Claude Code processes with Remote Control on, which the hub lists itself (`processes.py`)."""
        return report(self.processes.running())

    def handle(self, method: str, params: dict[str, Any]) -> Any:
        d = self.directory
        sid = str(params.get("session_id", ""))
        if method in MUTATING:
            self.audit.record("hub", method, sid or None)  # what was typed is never logged
        match method:
            case "conversation":
                return _json(d.conversation(sid, int(params.get("after", 0)), int(params.get("limit", 100))))
            case "image":
                image = d.image(sid, str(params.get("path", "")))
                return {"media_type": image.media_type, "data": base64.b64encode(image.data).decode()}
            case "screen":
                return _json(d.screen(sid, int(params.get("history", 200))))
            case "input":
                d.send_input(sid, SendInput.model_validate(params.get("body")))
            case "approve":
                return _json(d.approve(sid, params.get("option"), params.get("answers")))
            case "deny":
                return _json(d.deny(sid))
            case "resize":
                d.resize(sid, Resize.model_validate(params.get("body")))
            case "release_size":
                d.release_size(sid)
            case "update":
                return _json(d.update(sid, UpdateSession.model_validate(params.get("patch"))))
            case "terminate":
                d.terminate(sid)
            case "archive":
                self.archiver.archive(sid)
            case "mark_read":
                d.mark_read(sid, True)
            case "detect_folder":
                return self.placements.detect(sid)
            case "create":
                return _json(self.launcher.create(CreateSession.model_validate(params.get("request"))))
            case _:
                raise Invalid(f"unknown method {method}")
        return None
