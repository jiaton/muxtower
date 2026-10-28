import time

from muxtower.errors import NotFound
from muxtower.sessions.monitor import Monitor
from muxtower.sessions.service import SessionService
from muxtower.terminal.images import ImageDrop
from muxtower.terminal.models import Resize, Screen, SendInput

MAX_HISTORY = 5000
# A phone's terminal view can be only a few rows tall. Width decides how text wraps and follows the
# client; height never drops below this, so an agent always has room to draw its dialogs.
MIN_ROWS = 40


PASTE_SECONDS = 0.3  # for the agent to take a paste in before what follows
TYPE_UP_TO = 200  # characters of a single line typed as keys; longer, or several lines, is pasted


class TerminalService:
    def __init__(self, sessions: SessionService, monitor: Monitor, images: ImageDrop) -> None:
        self.sessions = sessions
        self.monitor = monitor
        self.images = images

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
        for image in body.images:  # each becomes [Image #n] in the prompt, ahead of the words
            tmux.paste(record.pane, str(self.images.save(image)))
            time.sleep(PASTE_SECONDS)
        if body.text is not None:
            # Typed, a newline is a key press (Claude Code kept only the last lines of a long message);
            # pasted, the text arrives whole and the agent takes it as one paste.
            pasted = "\n" in body.text or len(body.text) > TYPE_UP_TO
            if pasted:
                tmux.paste(record.pane, body.text)
            elif body.text:
                tmux.send_text(record.pane, body.text)
            if body.enter:
                runtime = self.sessions.runtime_of(record)
                delay = runtime.config.enter_delay if runtime else 0.0
                if pause := max(delay, PASTE_SECONDS if pasted else 0.0):
                    time.sleep(pause)
                tmux.send_key(record.pane, "Enter")
        elif body.key is not None:
            tmux.send_key(record.pane, body.key)

    def resize(self, session_id: str, body: Resize) -> None:
        """Fit the pane to a viewer. Any session may be resized because release() gives the size back."""
        record = self.sessions.record(session_id)
        self.sessions.tmux.resize(record.pane, body.cols, max(body.rows, MIN_ROWS))

    def release(self, session_id: str) -> None:
        """The viewer left or stopped fitting: hand the size back to attached terminals."""
        record = self.sessions.record(session_id)
        self.sessions.tmux.release_size(record.pane)
