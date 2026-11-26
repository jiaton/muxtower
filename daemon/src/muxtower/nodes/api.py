"""What a hub may do on this daemon (its node), by the method names of the link (`protocol.METHODS`):
the same as a device does through the API, on this daemon's own sessions. Blocking; run from a thread."""

import base64
import os
from collections.abc import Callable
from typing import Any

from pydantic import BaseModel

from muxtower.auth.service import TokenService
from muxtower.continuing.place import look
from muxtower.errors import Invalid
from muxtower.infra.audit import AuditLog
from muxtower.nodes.attachments import NodeUploads
from muxtower.nodes.direct import TOKEN_PREFIX
from muxtower.nodes.media import media_step
from muxtower.nodes.processes import report
from muxtower.nodes.shared import shared_step
from muxtower.sessions.archiving import Archiver
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.former_bridges import carrying
from muxtower.sessions.launcher import Launcher
from muxtower.sessions.models import CreateSession, Session, UpdateSession
from muxtower.sessions.placement import Placements
from muxtower.sessions.ports import ClaudeProcessPort
from muxtower.settings.service import SettingsService
from muxtower.subscriptions.reader import PlanReader
from muxtower.teams.checkout import checkout
from muxtower.terminal.models import Resize, SendInput
from muxtower.usage.models import MachineUsage


def _json(value: Any) -> Any:
    return value.model_dump(mode="json") if isinstance(value, BaseModel) else value


# What changes something here: audited as done by the hub, like a device's actions.
MUTATING = frozenset({
    "input", "approve", "deny", "update", "terminate", "archive", "create", "recover", "resume_archived",
    "accept_suggestion",
})  # fmt: skip
# What changes the list here (as the same routes say for a device): the hub hears of it at once.
CHANGES_LIST = MUTATING | {"mark_read"}
MAX_FIRSTS = 1000  # first messages the hub asks after in one `carries`


class NodeApi:
    def __init__(
        self, directory: SessionDirectory, launcher: Launcher, archiver: Archiver, placements: Placements,
        audit: AuditLog, processes: ClaudeProcessPort,
    ) -> None:  # fmt: skip
        self.processes = processes
        self.usage_now: Callable[[], MachineUsage] | None = None  # set once the usage sampler runs
        self.plans: PlanReader | None = None  # this machine's plans (`subscriptions/`), sent to the hub
        self.recover: Callable[[list[str]], list[Session]] | None = None  # set by the recovery service
        self.resume_archived: Callable[[str, str | None], Session] | None = None  # likewise
        self.search: Callable[[str, int], list[dict[str, Any]]] | None = None  # full-text, set by the app
        self.search_status: Callable[[], dict[str, Any]] | None = None
        self.settings: SettingsService | None = None  # its feature settings, which the hub may change
        self.tokens: TokenService | None = None  # its device tokens: the hub's devices get one here (`direct.py`)
        self.directory = directory
        self.uploads = NodeUploads(lambda *args: directory.upload(*args))  # files the hub passes on for a message
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

    def place(self, cwd: str) -> dict[str, str] | None:
        """The project a folder here belongs to, worked out as for this daemon's own sessions (git, cached):
        {project, source}, or None when it is in no repository here."""
        folder = os.path.expanduser(cwd)
        if not os.path.isabs(folder):
            return None
        found = (self.directory.checkout or checkout)(folder)
        return None if found.source == "folder" else {"project": found.project, "source": found.source}

    def handle(self, method: str, params: dict[str, Any]) -> Any:
        d = self.directory
        sid = str(params.get("session_id", ""))
        if method in MUTATING:
            self.audit.record("hub", method, sid or None)  # what was typed is never logged
        match method:
            case "conversation":
                around = params.get("around")
                after, limit = int(params.get("after", 0)), int(params.get("limit", 100))
                return _json(d.conversation(sid, after, limit, int(around) if around is not None else None))
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
            case "attachment":
                result = self.uploads.handle(sid, params)
                if params.get("step") == "finish":  # its name and size; never what is in it
                    self.audit.record("hub", "attachment", sid, f"name={result['name']} size={result['size']}")
                return result
            case "shared":
                return shared_step(d, sid, params)
            case "media":
                return media_step(d, sid, params)
            case "accept_suggestion":
                d.accept_suggestion(sid, str(params.get("text", "")))
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
            case "search_status":
                return self.search_status() if self.search_status else None
            case "search":
                if self.search is None:
                    return []
                return self.search(str(params.get("q") or ""), int(params.get("limit") or 20))
            case "resume_archived":
                if self.resume_archived is None:
                    raise Invalid("this node cannot start archived sessions again")
                cwd = params.get("cwd")
                return _json(self.resume_archived(sid, cwd if isinstance(cwd, str) else None))
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
            case "default_folder":
                return self.settings.settings.sessions.folder() if self.settings else None
            case "names":
                return [
                    {"name": n.name, "source": n.source, "last_seen": n.last_seen.isoformat()} for n in d.names(sid)
                ]
            case "claude_conversation":  # a Remote Control session's conversation here (`continuing/place.py`)
                remote_id, agent_id = params.get("remote_id"), params.get("agent_id")
                return look(
                    self.processes, remote_id if isinstance(remote_id, str) else None,
                    agent_id if isinstance(agent_id, str) else None,
                ).as_json()  # fmt: skip
            case "place":  # where a folder here sits in git, for a session the hub lists itself
                return self.place(str(params.get("cwd") or ""))
            case "mark_read":
                d.mark_read(sid, True)
            case "detect_folder":
                return self.placements.detect(sid)
            case "ended_bridges":  # the hub archives them (`sessions/ended_bridges.py`)
                ask = getattr(self.processes, "ended_bridges", None)
                return ask() if ask else {}
            case "carries":  # the hub folds a bridge on its own into the one session carrying it (`former_bridges.py`)
                firsts = params.get("firsts")
                carries = getattr(self.processes, "carries", None)
                if not isinstance(firsts, list) or len(firsts) > MAX_FIRSTS or carries is None:
                    raise Invalid("firsts: a list of first message ids")
                return carrying(d, [str(f) for f in firsts], carries)
            case "create":
                return _json(self.launcher.create(CreateSession.model_validate(params.get("request"))))
            case _:
                raise Invalid(f"unknown method {method}")
        return None
