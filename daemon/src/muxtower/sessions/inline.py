"""Images inside a tool's result (a browser's screenshot, an image file Read), which have no file of their own.
The conversation lists only where each is (`MediaRef`: its item and place); the bytes stay in the transcript, and
are read from there again when asked (`found_in`), never kept with the conversation."""

from typing import Any

from muxtower.sessions.models import ConversationItem, MediaKind, MediaRef, MediaSource

Inline = tuple[str, str]  # (media type as the block says, base64)


def inline_images(content: Any) -> list[Inline]:
    """The images in a tool result's content: Claude Code's image blocks, Codex's input_image data URLs."""
    if not isinstance(content, list):
        return []
    found: list[Inline] = []
    for block in content:
        if not isinstance(block, dict):
            continue
        source = block.get("source")
        if block.get("type") == "image" and isinstance(source, dict) and source.get("type") == "base64":
            data, media_type = source.get("data"), source.get("media_type")
            if isinstance(data, str) and data:
                found.append((str(media_type or ""), data))
        elif block.get("type") in ("input_image", "image") and isinstance(url := block.get("image_url"), str):
            head, _, data = url.partition(",")
            if head.startswith("data:") and head.endswith(";base64") and data:
                found.append((head[5:].removesuffix(";base64"), data))
    return found


def with_inline(item: ConversationItem, images: list[Inline]) -> ConversationItem:
    refs = [
        MediaRef(source=MediaSource.INLINE, kind=MediaKind.IMAGE, index=i, media_type=media_type or None)
        for i, (media_type, _) in enumerate(images)
    ]
    files = [m for m in item.media if m.source == MediaSource.FILE]
    return item.model_copy(update={"media": files + refs})


class Finding:
    """Mixed into a builder: when `inline_for` is an item's seq, the images of that item's result are kept as it
    reads them (`inline_found`), and only those."""

    inline_for: int | None = None
    inline_found: list[Inline] | None = None

    def _inline(self, item: ConversationItem | None, seq: int, images: list[Inline]) -> ConversationItem | None:
        if item is None or not images:
            return item
        if seq == self.inline_for:
            self.inline_found = images
        return with_inline(item, images)
