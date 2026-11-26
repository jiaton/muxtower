"""Images and videos a conversation shows, served (`sessions/media.py`, `media_reading.py`, `media_routes.py`): only
what the conversation names (never a tool's input), typed by content, regular files only, at most 25 MB, with
ranges for video; and images inside a tool's result, read again from the transcript."""

import os
from pathlib import Path

import pytest

from muxtower.sessions.media import MAX_BYTES, sniff
from tests.media_fakes import (
    MP4,
    PNG,
    WEBM,
    image_block,
    phone,
    said,
    session_app,
    text,
    tool_result,
    tool_use,
)


@pytest.fixture
def where(tmp_path: Path) -> tuple[Path, Path]:
    home, work = tmp_path / "home", tmp_path / "work"
    (work / "out").mkdir(parents=True)
    (home / "shots").mkdir(parents=True)
    return home, work


def _served(tmp_path: Path, home: Path, work: Path, transcript: str):  # type: ignore[no-untyped-def]
    app = session_app(tmp_path, transcript, work)
    app.state.directory.home = home
    client = phone(app)
    (listed,) = client.get("/v1/sessions").json()
    sid = listed["id"]
    items = client.get(f"/v1/sessions/{sid}/conversation").json()["items"]
    return client, sid, items


def test_an_image_or_video_path_in_what_was_written_renders(tmp_path: Path, where: tuple[Path, Path]) -> None:
    home, work = where
    (home / "shots" / "a.png").write_bytes(PNG)
    (work / "out" / "b.png").write_bytes(PNG)
    (work / "c.webm").write_bytes(WEBM)
    (tmp_path / "d.png").write_bytes(PNG)
    reply = f"Before: ~/shots/a.png, after: out/b.png ![clip](c.webm) and {tmp_path / 'd.png'}"
    client, sid, items = _served(tmp_path, home, work, said("user", text("show me")) + said("assistant", text(reply)))
    media = items[-1]["media"]
    assert [(m["path"], m["kind"], m["source"]) for m in media] == [
        ("~/shots/a.png", "image", "file"), ("out/b.png", "image", "file"), ("c.webm", "video", "file"),
        (str(tmp_path / "d.png"), "image", "file"),
    ]  # fmt: skip
    for ref, body, kind in zip(
        media, (PNG, PNG, WEBM, PNG), ("image/png", "image/png", "video/webm", "image/png"), strict=False
    ):
        got = client.get(f"/v1/sessions/{sid}/media", params={"path": ref["path"]})
        assert (got.status_code, got.content, got.headers["content-type"]) == (200, body, kind)
        assert got.headers["content-security-policy"] == "sandbox; default-src 'none'"
        assert got.headers["x-content-type-options"] == "nosniff"


def test_the_owners_own_paths_are_shown_too(tmp_path: Path, where: tuple[Path, Path]) -> None:
    home, work = where
    (work / "out" / "mine.png").write_bytes(PNG)
    client, sid, items = _served(tmp_path, home, work, said("user", text("look at out/mine.png please")))
    assert items[0]["media"][0]["path"] == "out/mine.png"
    assert client.get(f"/v1/sessions/{sid}/media", params={"path": "out/mine.png"}).status_code == 200


def test_a_path_only_in_a_tools_input_is_not_shown(tmp_path: Path, where: tuple[Path, Path]) -> None:
    home, work = where
    for name in ("copied.png", "written.png"):
        (work / "out" / name).write_bytes(PNG)
    transcript = (
        said("user", text("go"))
        + said("assistant", tool_use("t1", "Bash", {"command": "cp ~/x.png out/copied.png"}),
               tool_use("t2", "Write", {"file_path": str(work / "out" / "written.png"), "content": "x"}))
        + said("user", tool_result("t1", text("done")), tool_result("t2", text("written")))
    )  # fmt: skip
    client, sid, items = _served(tmp_path, home, work, transcript)
    assert all(item["media"] == [] for item in items)
    for path in ("out/copied.png", str(work / "out" / "written.png"), "~/x.png"):
        assert client.get(f"/v1/sessions/{sid}/media", params={"path": path}).status_code == 404


def test_a_file_named_as_an_image_that_is_not_one_is_refused(tmp_path: Path, where: tuple[Path, Path]) -> None:
    home, work = where
    (home / ".ssh").mkdir()
    (home / ".ssh" / "id_ed25519.png").write_text("-----BEGIN OPENSSH PRIVATE KEY-----\nmade up\n")
    (work / "out" / "notes.png").write_text("just some text")
    (work / "out" / "logo.png").write_text('<svg xmlns="http://www.w3.org/2000/svg"><script>x()</script></svg>')
    reply = "See ~/.ssh/id_ed25519.png, out/notes.png and out/logo.png"
    client, sid, _ = _served(tmp_path, home, work, said("assistant", text(reply)))
    for path in ("~/.ssh/id_ed25519.png", "out/notes.png", "out/logo.png"):
        got = client.get(f"/v1/sessions/{sid}/media", params={"path": path})
        assert got.status_code == 415 and b"OPENSSH" not in got.content


def test_only_regular_files_through_links(tmp_path: Path, where: tuple[Path, Path]) -> None:
    home, work = where
    os.mkfifo(work / "pipe")
    (work / "out" / "real.png").write_bytes(PNG)
    links = {
        "fifo.png": work / "pipe",
        "dir.png": work / "out",
        "null.png": Path("/dev/null"),
        "ok.png": work / "out" / "real.png",
    }
    for name, target in links.items():
        (work / name).symlink_to(target)
    reply = " ".join(f"./{name}" for name in links)
    client, sid, _ = _served(tmp_path, home, work, said("assistant", text(reply)))
    statuses = {n: client.get(f"/v1/sessions/{sid}/media", params={"path": f"./{n}"}).status_code for n in links}
    assert statuses == {"fifo.png": 415, "dir.png": 415, "null.png": 415, "ok.png": 200}


def test_gone_too_large_and_unshown(tmp_path: Path, where: tuple[Path, Path]) -> None:
    home, work = where
    (work / "out" / "gone.png").write_bytes(PNG)
    with open(work / "out" / "huge.mp4", "wb") as f:
        f.write(MP4[:64])
        f.truncate(MAX_BYTES + 1)
    client, sid, _ = _served(tmp_path, home, work, said("assistant", text("out/gone.png out/huge.mp4")))
    (work / "out" / "gone.png").unlink()
    url = f"/v1/sessions/{sid}/media"
    assert client.get(url, params={"path": "out/gone.png"}).status_code == 410
    assert client.get(url, params={"path": "out/huge.mp4"}).status_code == 413
    assert client.get(url, params={"path": "/etc/passwd"}).status_code == 404


def test_a_video_is_served_in_ranges(tmp_path: Path, where: tuple[Path, Path]) -> None:
    home, work = where
    (work / "out" / "clip.mp4").write_bytes(MP4)
    client, sid, _ = _served(tmp_path, home, work, said("assistant", text("recorded out/clip.mp4")))
    url, path = f"/v1/sessions/{sid}/media", {"path": "out/clip.mp4"}
    whole = client.get(url, params=path)
    assert whole.status_code == 200 and whole.content == MP4 and whole.headers["accept-ranges"] == "bytes"
    part = client.get(url, params=path, headers={"Range": "bytes=1000-1999"})
    assert part.status_code == 206 and part.content == MP4[1000:2000]
    assert part.headers["content-range"] == f"bytes 1000-1999/{len(MP4)}"
    tail = client.get(url, params=path, headers={"Range": "bytes=-10"})
    assert tail.status_code == 206 and tail.content == MP4[-10:]
    outside = client.get(url, params=path, headers={"Range": f"bytes={len(MP4) + 5}-"})
    assert outside.status_code == 416 and outside.headers["content-range"] == f"bytes */{len(MP4)}"


def test_an_image_inside_a_tools_result_is_shown_and_read_again_from_the_transcript(
    tmp_path: Path, where: tuple[Path, Path]
) -> None:
    home, work = where
    transcript = (
        said("user", text("screenshot it"))
        + said("assistant", text("Taking it."), tool_use("t1", "mcp__browser__screenshot", {"url": "https://example.test"}))
        + said("user", tool_result("t1", text("captured"), image_block(PNG), image_block(b"not a picture")))
    )  # fmt: skip
    client, sid, items = _served(tmp_path, home, work, transcript)
    (tool,) = (i for i in items if i["kind"] == "tool")
    assert tool["status"] == "done" and [(m["source"], m["index"], m["media_type"]) for m in tool["media"]] == [
        ("inline", 0, "image/png"),
        ("inline", 1, "image/png"),
    ]
    assert "base64" not in str(items) and "bWFkZS" not in str(items)  # no bytes in the conversation
    url = f"/v1/sessions/{sid}/items/{tool['seq']}/media"
    got = client.get(f"{url}/0")
    assert (got.status_code, got.content, got.headers["content-type"]) == (200, PNG, "image/png")
    assert got.headers["content-security-policy"] == "sandbox; default-src 'none'"
    assert client.get(f"{url}/1").status_code == 415  # it said png; its content is not one
    assert client.get(f"{url}/2").status_code == 404
    assert client.get(f"/v1/sessions/{sid}/items/{tool['seq'] + 1}/media/0").status_code == 404


def test_a_codex_rollouts_inline_image(tmp_path: Path) -> None:
    import base64
    import json

    from muxtower.sessions.transcripts import Transcripts

    url = "data:image/png;base64," + base64.b64encode(PNG).decode()
    lines = [
        {"type": "response_item", "payload": {"type": "function_call", "name": "view_image", "call_id": "c1",
                                              "arguments": json.dumps({"path": "/srv/a.png"})}},
        {"type": "response_item", "payload": {"type": "function_call_output", "call_id": "c1",
                                              "output": [{"type": "input_image", "image_url": url}]}},
    ]  # fmt: skip
    path = tmp_path / "rollout-2026-01-05T09-00-00-made-up.jsonl"
    path.write_text("".join(json.dumps(line) + "\n" for line in lines))
    transcripts = Transcripts()
    (tool,) = transcripts.conversation("s", str(path), 0, 10).items
    assert [(m.source, m.index) for m in tool.media if m.source == "inline"] == [("inline", 0)]
    assert base64.b64decode(transcripts.inline(str(path), tool.seq, 0)) == PNG


def test_content_decides_the_type() -> None:
    assert sniff(PNG) == "image/png" and sniff(MP4[:64]) == "video/mp4" and sniff(WEBM) == "video/webm"
    assert sniff(b"\x00\x00\x00\x1cftypavif") == "image/avif" and sniff(b"\x00\x00\x00\x1cftypheic") is None
    assert sniff(b"GIF89a...") == "image/gif" and sniff(b"\xff\xd8\xff\xe0") == "image/jpeg"
    assert sniff(b"RIFF\x00\x00\x00\x00WEBPVP8 ") == "image/webp"
    assert sniff(b"<svg") is None and sniff(b"%PDF-1.7") is None
