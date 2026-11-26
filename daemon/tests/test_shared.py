"""Files an agent shares with the owner (`share_file`): the contract. Pictures, playable videos and PDF are
served as themselves; anything a browser could run (SVG, HTML) or sniff is a download."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from muxtower.sessions.models import ConversationItem, ConversationItemKind
from muxtower.shared.models import DOWNLOAD_TYPE, SharedFile, served_type


@pytest.mark.parametrize(
    ("media_type", "served"),
    [
        ("image/png", "image/png"),
        ("image/JPEG", "image/jpeg"),
        ("video/mp4", "video/mp4"),
        ("video/webm; codecs=vp9", "video/webm"),
        ("application/pdf", "application/pdf"),
        ("image/svg+xml", DOWNLOAD_TYPE),
        ("text/html", DOWNLOAD_TYPE),
        ("application/xhtml+xml", DOWNLOAD_TYPE),
        ("video/quicktime", DOWNLOAD_TYPE),
        ("", DOWNLOAD_TYPE),
    ],
)
def test_only_safe_types_are_served_as_themselves(media_type: str, served: str) -> None:
    assert served_type(media_type) == served


def test_a_shared_item_carries_its_file() -> None:
    now = datetime(2026, 1, 2, 3, 4, tzinfo=UTC)
    shared = SharedFile(
        id="f1", name="launch.png", size=10, media_type="image/png", caption="the new page",
        shared_at=now, expires_at=now + timedelta(days=7),
    )  # fmt: skip
    item = ConversationItem(seq=16, at=now, kind=ConversationItemKind.SHARED, text="the new page", shared=shared)
    assert ConversationItem.model_validate(item.model_dump(mode="json")).shared == shared


def test_an_unknown_shared_file_is_not_found(client: TestClient, auth: dict[str, str]) -> None:
    assert client.get("/v1/sessions/s1/shared/nope", headers=auth).status_code == 404
    assert client.get("/v1/sessions/s1/shared/nope").status_code == 401
