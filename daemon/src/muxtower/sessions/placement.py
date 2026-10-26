"""Where a session runs, when its source does not say (`capabilities.place`): the Claude desktop app, for
one, reports no machine for its sessions and, in the part of the log kept, often no folder. The owner
places such a session by hand, kept as their placement (`SessionMarks`) over what the source reports;
reading its whole log for the folder its tool calls ran in only suggests one, for the owner to save.
"""

from muxtower.errors import Conflict
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.marks import SessionMarks
from muxtower.sessions.models import Placement, Session


class Placements:
    def __init__(self, directory: SessionDirectory, marks: SessionMarks) -> None:
        self.directory = directory
        self.marks = marks

    def place(self, session_id: str, placement: Placement) -> Session:
        """Places it (empty fields: not placed, as the source says)."""
        session = self.directory.require(session_id, "place")
        self.marks.place(session.id, placement.machine, placement.folder)
        return self.directory.get(session.id)

    def detect(self, session_id: str) -> str | None:
        """The folder its whole log names, if any: a suggestion, nothing is kept."""
        session = self.directory.require(session_id, "place")
        source = self.directory.source_of(session.id)
        if source is None:
            raise Conflict("only sessions from another source can be detected")
        return source.detect_folder(session.id)
