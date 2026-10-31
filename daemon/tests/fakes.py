from dataclasses import dataclass, field

from muxtower.terminal.ports import PaneInfo, PaneRef


@dataclass
class FakePane:
    info: PaneInfo
    argv: list[str]
    env: dict[str, str]
    screen: str = ""
    sent: list[tuple[str, str]] = field(default_factory=list)  # ("text"|"key", value)


class FakeTmux:
    """In-memory TmuxPort: tests set `screen` on panes and read back what was sent."""

    def __init__(self) -> None:
        self.panes: dict[tuple[str, str], FakePane] = {}
        self._next = 0
        self.missing: set[str] = set()  # binaries not installed

    def add_pane(self, socket: str, session: str, command: str, cwd: str = "/tmp") -> FakePane:  # noqa: S108
        self._next += 1
        pane = FakePane(PaneInfo(socket, f"%{self._next}", session, command, cwd), [command], {})
        self.panes[(socket, pane.info.pane_id)] = pane
        return pane

    def pane(self, ref: PaneRef) -> FakePane:
        return self.panes[(ref.socket, ref.pane_id)]

    def new_session(
        self, socket: str, name: str, cwd: str, argv: list[str], env: dict[str, str], cols: int, rows: int
    ) -> PaneRef:
        pane = self.add_pane(socket, name, argv[0], cwd)
        pane.argv, pane.env = argv, env
        return PaneRef(socket, pane.info.pane_id)

    def finds(self, socket: str, binary: str) -> bool:
        return binary not in self.missing

    def list_panes(self, socket: str) -> list[PaneInfo]:
        return [p.info for (s, _), p in self.panes.items() if s == socket]

    def capture(self, pane: PaneRef, ansi: bool = False, history: int = 0) -> str | None:
        found = self.panes.get((pane.socket, pane.pane_id))
        return found.screen if found else None

    def send_text(self, pane: PaneRef, text: str) -> None:
        self.pane(pane).sent.append(("text", text))

    def paste(self, pane: PaneRef, text: str) -> None:
        self.pane(pane).sent.append(("paste", text))

    def send_key(self, pane: PaneRef, key: str) -> None:
        self.pane(pane).sent.append(("key", key))

    def resize(self, pane: PaneRef, cols: int, rows: int) -> None:
        self.pane(pane).sent.append(("resize", f"{cols}x{rows}"))

    def release_size(self, pane: PaneRef) -> None:
        self.pane(pane).sent.append(("release", ""))

    def kill_session(self, socket: str, name: str) -> None:
        for key, pane in list(self.panes.items()):
            if key[0] == socket and pane.info.session_name == name:
                del self.panes[key]

    def kill_pane(self, pane: PaneRef) -> None:
        self.panes.pop((pane.socket, pane.pane_id), None)
