"""The images and videos a session's conversation shows, read for the app (`media_routes.py`). Part of
`SessionDirectory`; a hub reads a node's session's from its node, in pieces (`nodes/media.py`).

A file is read only if the conversation names it (as written: `~/`, or relative to the session's folder, is
resolved on the session's machine), and only on that machine. An image inside a tool's result is read again from
the session's transcript or log, and the last few kept decoded while they are being sent."""

import threading
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from muxtower.errors import Conflict, NotFound
from muxtower.sessions.media import MediaInfo, decoded, file_info, read_file, where
from muxtower.sessions.models import Conversation, MediaSource, Session

SHOWN_ITEMS = 2000  # how far back in a conversation its media can be read
KEPT_INLINE = 2  # decoded inline images kept while pieces of them are asked for


@dataclass(frozen=True)
class MediaAsk:
    """A file as the conversation wrote it (`path`), or the `index`th image in item `seq`'s tool result."""

    path: str | None = None
    seq: int | None = None
    index: int | None = None

    def params(self) -> dict[str, Any]:
        return {"path": self.path} if self.path is not None else {"seq": self.seq, "index": self.index}

    @classmethod
    def of(cls, params: dict[str, Any]) -> "MediaAsk":
        if isinstance(params.get("path"), str):
            return cls(path=params["path"])
        return cls(seq=int(params.get("seq") or 0), index=int(params.get("index") or 0))


class MediaReading:
    home: Path = Path.home()
    _inline_lock: threading.Lock
    _inline_kept: "OrderedDict[tuple[str, int, int], tuple[MediaInfo, bytes]]"

    def _media_init(self) -> None:
        self._inline_lock = threading.Lock()
        self._inline_kept = OrderedDict()

    def get(self, session_id: str) -> Session:
        raise NotImplementedError

    def conversation(self, session_id: str, after: int, limit: int, around: int | None = None) -> Conversation:
        raise NotImplementedError

    def _inline_data(self, session_id: str, seq: int, index: int) -> str:
        raise NotImplementedError

    def media_info(self, session_id: str, ask: MediaAsk) -> MediaInfo:
        if ask.path is not None:
            return file_info(self._media_path(session_id, ask.path))
        return self._decoded(session_id, ask)[0]

    def read_media(self, session_id: str, ask: MediaAsk, offset: int, length: int) -> bytes:
        if ask.path is not None:
            return read_file(self._media_path(session_id, ask.path), offset, length)
        return self._decoded(session_id, ask)[1][offset : offset + max(0, length)]

    def _media_path(self, session_id: str, written: str) -> Path:
        items = self.conversation(session_id, 0, SHOWN_ITEMS).items
        if not any(m.source == MediaSource.FILE and m.path == written for item in items for m in item.media):
            raise NotFound("the conversation shows no such image or video")
        session = self.get(session_id)
        if not session.on_host:
            raise Conflict("the file is on the machine the session runs on, which is not this one")
        return where(written, self.home, session.working_dir or session.cwd)

    def _decoded(self, session_id: str, ask: MediaAsk) -> tuple[MediaInfo, bytes]:
        key = (self.get(session_id).id, ask.seq or 0, ask.index or 0)
        cache = self._inline_kept
        with self._inline_lock:
            if (kept := cache.get(key)) is not None:
                cache.move_to_end(key)
                return kept
        found = decoded(self._inline_data(session_id, *key[1:]))
        with self._inline_lock:
            cache[key] = found
            while len(cache) > KEPT_INLINE:
                cache.popitem(last=False)
        return found
