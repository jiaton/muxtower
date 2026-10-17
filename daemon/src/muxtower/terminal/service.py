from muxtower.errors import Forbidden, NotFound
from muxtower.sessions.monitor import Monitor
from muxtower.sessions.ports import SessionSource
from muxtower.sessions.service import SessionService
from muxtower.terminal.models import Resize, Screen, SendInput

MAX_HISTORY = 5000
# A phone's terminal view can be only a few rows tall. Width decides how text wraps and follows the
# client; height never drops below this, so an agent always has room to draw its dialogs.
MIN_ROWS = 40


class TerminalService:
    def __init__(self, sessions: SessionService, monitor: Monitor) -> None:
        self.sessions = sessions
        self.monitor = monitor

    def screen(self, session_id: str, history: int) -> Screen:
        record = self.sessions.record(session_id)
        history = max(0, min(history, MAX_HISTORY))
        text = self.sessions.tmux.capture(record.pane)
        if text is None:
            raise NotFound("pane is gone")
        ansi = self.sessions.tmux.capture(record.pane, ansi=True, history=history)
        return Screen(session_id=session_id, text=text, ansi=ansi)

    def send(self, session_id: str, body: SendInput) -> None:
        record = self.sessions.record(session_id)
        tmux = self.sessions.tmux
        if body.text is not None:
            tmux.send_text(record.pane, body.text)
            if body.enter:
                tmux.send_key(record.pane, "Enter")
        elif body.key is not None:
            tmux.send_key(record.pane, body.key)

    def resize(self, session_id: str, body: Resize) -> None:
        record = self.sessions.record(session_id)
        if record.source != SessionSource.LAUNCHED:
            raise Forbidden("only sessions started by muxtower can be resized")
        self.sessions.tmux.resize(record.pane, body.cols, max(body.rows, MIN_ROWS))
