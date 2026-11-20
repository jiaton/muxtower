"""A file attached to a message to a node's session: saved on that node, where its agent reads it.

The hub passes the upload on as it arrives, in chunks of the link's `attachment` method (`step`: begin,
append, finish, abort), so neither side holds the whole file and no frame nears the link's limit; the node
writes it as its own uploads are written (`attachments/store.py`), by its own `attachments.max_mb`."""

import base64
import binascii
import logging
import secrets
import threading
import time
from collections.abc import Callable
from typing import TYPE_CHECKING, Any

from muxtower.attachments.models import Attachment
from muxtower.attachments.ports import Upload
from muxtower.errors import Conflict, Invalid

if TYPE_CHECKING:
    from muxtower.nodes.source import NodeSource

logger = logging.getLogger("muxtower.nodes")

CHUNK_BYTES = 1024 * 1024  # each `append`: ~1.4 MB as base64, far under the link's frame limit
ABANDONED_SECONDS = 3600  # an upload the hub stopped sending, forgotten on the node


class NodeUpload:
    """Hub side: one upload, passed on to the session's node."""

    def __init__(self, nodes: "NodeSource", session_id: str, name: str, media_type: str) -> None:
        self.nodes = nodes
        self.session_id = session_id
        self._buffer = bytearray()
        self._done = False
        try:
            begun = nodes.upload_step(session_id, {"step": "begin", "name": name, "media_type": media_type})
        except Invalid as exc:  # a node older than attachments: "unknown method"
            raise Conflict(f"its machine cannot take files yet: update muxtower there ({exc})") from exc
        self.upload = str(begun["upload"])
        self.max_bytes = int(begun["max_bytes"])

    def _step(self, step: str, **params: Any) -> Any:
        return self.nodes.upload_step(self.session_id, {"step": step, "upload": self.upload, **params})

    def _flush(self) -> None:
        if self._buffer:
            data, self._buffer = bytes(self._buffer), bytearray()
            self._step("append", data=base64.b64encode(data).decode())

    def write(self, data: bytes) -> None:
        self._buffer += data
        if len(self._buffer) >= CHUNK_BYTES:
            self._flush()

    def finish(self) -> Attachment:
        self._flush()
        attachment = Attachment.model_validate(self._step("finish"))
        self._done = True
        return attachment

    def abort(self) -> None:
        if self._done:
            return
        self._done = True
        try:
            self._step("abort")
        except Exception as exc:  # noqa: BLE001 - the node drops it after ABANDONED_SECONDS anyway
            logger.info("an upload to %s was not aborted there: %s", self.session_id, exc)


class NodeUploads:
    """Node side: the uploads the hub is passing on, by id, until finished or aborted."""

    def __init__(self, begin: Callable[[str, str, str], Upload]) -> None:
        self.begin = begin  # the directory's `upload`: this session takes files, saved here
        self._open: dict[str, tuple[Upload, float]] = {}
        self._lock = threading.Lock()

    def handle(self, session_id: str, params: dict[str, Any]) -> Any:
        step = params.get("step")
        if step == "begin":
            self._forget_abandoned()
            upload = self.begin(session_id, str(params.get("name") or ""), str(params.get("media_type") or ""))
            upload_id = secrets.token_hex(8)
            with self._lock:
                self._open[upload_id] = (upload, time.monotonic())
            return {"upload": upload_id, "max_bytes": upload.max_bytes}
        upload_id = str(params.get("upload") or "")
        with self._lock:
            found = self._open.get(upload_id)
            if found and step == "append":
                self._open[upload_id] = (found[0], time.monotonic())
        if found is None:
            raise Conflict("no such upload here (finished, aborted or abandoned)")
        upload = found[0]
        match step:
            case "append":
                try:
                    data = base64.b64decode(str(params.get("data") or ""), validate=True)
                except binascii.Error as exc:
                    self._drop(upload_id)
                    raise Invalid("data: not base64") from exc
                try:
                    upload.write(data)
                except BaseException:
                    self._drop(upload_id)
                    raise
                return None
            case "finish":
                self._drop(upload_id, abort=False)
                return upload.finish().model_dump(mode="json")
            case "abort":
                self._drop(upload_id)
                return None
        raise Invalid(f"unknown attachment step {step!r}")

    def _drop(self, upload_id: str, abort: bool = True) -> None:
        with self._lock:
            found = self._open.pop(upload_id, None)
        if found and abort:
            found[0].abort()

    def _forget_abandoned(self) -> None:
        old = time.monotonic() - ABANDONED_SECONDS
        with self._lock:
            stale = [k for k, (_, at) in self._open.items() if at < old]
        for upload_id in stale:
            self._drop(upload_id)
