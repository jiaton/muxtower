from muxtower.sources.remote_control.folder import WorkingFolder
from muxtower.sources.remote_control.ports import RawEvent


def tools(seq: int, *dirs: str) -> RawEvent:
    context = {f"toolu_{i}": {"cwd": d} for i, d in enumerate(dirs)}
    return RawEvent(
        seq=seq, created_at=None, source="worker", payload={"type": "assistant", "wire_ingest_context": context}
    )


def test_the_declared_directory_wins() -> None:
    folder = WorkingFolder()
    folder.feed(
        [
            tools(1, "/var/scratch"),
            RawEvent(2, None, "worker", {"type": "system", "subtype": "vcs_state_changed", "cwd": "/srv/app"}),
        ]
    )
    assert folder.cwd == "/srv/app"


def test_otherwise_the_deepest_directory_holding_most_tool_calls() -> None:
    folder = WorkingFolder()
    assert folder.cwd == ""
    folder.feed(
        [
            tools(1, "/Users/me/jobs", "/Users/me/jobs/apps", "/Users/me/jobs/b"),
            tools(2, "/Users/me/jobs/apps", "/var/scratch"),
        ]
    )
    assert folder.cwd == "/Users/me/jobs"
    folder.feed([tools(3, "/Users/me/jobs/apps", "/Users/me/jobs/apps")])
    assert folder.cwd == "/Users/me/jobs/apps"
