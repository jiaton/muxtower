"""What a hub may do on this daemon (its node), by the method names of the link (`protocol.METHODS`):
the same as a device does through the API, on this daemon's own sessions. Blocking; run from a thread."""

import base64
from collections.abc import Callable
from typing import Any

from pydantic import BaseModel

from muxtower.auth.service import TokenService
from muxtower.errors import Invalid
from muxtower.infra.audit import AuditLog
from muxtower.nodes.direct import TOKEN_PREFIX
from muxtower.nodes.processes import report
from muxtower.sessions.archiving import Archiver
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.launcher import Launcher
from muxtower.sessions.models import CreateSession, Session, UpdateSession
from muxtower.sessions.placement import Placements
from muxtower.sessions.ports import ClaudeProcessPort
from muxtower.settings.service import SettingsService
from muxtower.terminal.models import Resize, SendInput
from muxtower.usage.models import MachineUsage


def _json(value: Any) -> Any:
    return value.model_dump(mode="json") if isinstance(value, BaseModel) else value


# What changes something here: audited as done by the hub, like a device's actions.
MUTATING = frozenset({"input", "approve", "deny", "update", "terminate", "archive", "create", "recover"})
# What changes the list here (as the same routes say for a device): the hub hears of it at once.
CHANGES_LIST = MUTATING | {"mark_read"}


class NodeApi:
    def __init__(
        self, directory: SessionDirectory, launcher: Launcher, archiver: Archiver, placements: Placements,
        audit: AuditLog, processes: ClaudeProcessPort,
    ) -> None:  # fmt: skip
        self.processes = processes
        self.usage_now: Callable[[], MachineUsage] | None = None  # set once the usage sampler runs
        self.recover: Callable[[list[str]], list[Session]] | None = None  # set by the recovery service
        self.settings: SettingsService | None = None  # its feature settings, which the hub may change
        self.tokens: TokenService | None = None  # its device tokens: the hub's devices get one here (`direct.py`)
        self.directory = directory
        self.launcher = launcher
        self.archiver = archiver
        self.placements = placements
        self.audit = audit

    def sessions(self) -> list[dict[str, Any]]:
        """Everything it lists itself (not what its own nodes report: a node is no hub of the hub's)."""
        return [s.model_dump(mode="json") for s in self.directory.list() if s.node is None]

    def usage(self) -> MachineUsage | None:
        return self.usage_now() if self.usage_now else None

    def running(self) -> list[dict[str, Any]]:
        """Its Claude Code processes with Remote Control on, which the hub lists itself (`processes.py`)."""
        return report(self.processes.running(), self.directory.checkout)

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
            case "recover":
                if self.recover is None:
                    raise Invalid("this node cannot start sessions again")
                started = self.recover([sid])
                return _json(started[0]) if started else None
            case "mint_token" | "revoke_token":
                name = str(params.get("name", ""))
                if self.tokens is None or not name.startswith(TOKEN_PREFIX):
                    raise Invalid("only a hub device's direct token")  # never another device's
                self.tokens.revoke(name)  # one per hub device: a new one replaces the last
                if method == "mint_token":
                    self.audit.record("hub", "direct-token", detail=name)
                    return self.tokens.create(name)[1]
                self.audit.record("hub", "direct-token-revoked", detail=name)
            case "settings" | "set_settings":
                if self.settings is None:
                    raise Invalid(f"unknown method {method}")
                if method == "settings":
                    return [_json(s) for s in self.settings.views()]
                changes = params.get("values")
                if not isinstance(changes, dict):
                    raise Invalid("values: a table of settings")
                return [_json(s) for s in self.settings.change(changes, f"hub ({params.get('actor') or 'owner'})")]
            case "mark_read":
                d.mark_read(sid, True)
            case "detect_folder":
                return self.placements.detect(sid)
            case "create":
                return _json(self.launcher.create(CreateSession.model_validate(params.get("request"))))
            case _:
                raise Invalid(f"unknown method {method}")
        return None
