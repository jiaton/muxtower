"""`share_file`, the MCP tool an agent puts a file in front of the owner with: only a session can call it
(its own token: `Caller.session_id`), and the file goes into that session's own conversation."""

from collections.abc import Callable

from muxtower.errors import Forbidden
from muxtower.infra.audit import AuditLog
from muxtower.mcp.caller import CALLER
from muxtower.mcp.tool import Tool
from muxtower.shared.items import share_result
from muxtower.shared.models import SHARE_DESCRIPTION, SHARE_TOOL, ShareArgs, SharedFile


class ShareTool:
    def __init__(self, share: Callable[[str, str, str | None], SharedFile]) -> None:
        self.share = share  # the directory's: copies it here, for the session
        self.audit: AuditLog | None = None  # set by the app
        self.changed: Callable[[str], None] | None = None  # set by the app: the session's list entry changed

    def tool(self) -> Tool:
        return Tool(SHARE_TOOL, SHARE_DESCRIPTION, ShareArgs, self.run)

    def run(self, args: ShareArgs) -> str:
        caller = CALLER.get()
        if caller.session_id is None:
            raise Forbidden("only a session can share a file: it goes into that session's own conversation")
        shared = self.share(caller.session_id, args.path, args.caption)
        if self.audit is not None:  # its name and size; never what is in it
            self.audit.record(caller.actor, "share", caller.session_id, f"name={shared.name} size={shared.size}")
        if self.changed is not None:
            self.changed(caller.session_id)
        return share_result(shared)
