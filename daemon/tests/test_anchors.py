"""A project sits in each device's folder tree where most of its sessions there are, and stays put."""

from datetime import UTC, datetime, timedelta

from muxtower.runtimes.models import AgentState
from muxtower.sessions.anchors import ProjectAnchors
from muxtower.sessions.models import Capabilities, GitPlace, Session, StateSource
from muxtower.sessions.ports import SessionSource

T0 = datetime(2026, 11, 3, tzinfo=UTC)


def _s(
    sid: str, cwd: str, repo: str | None = None, machine: str = "nas", minutes: int = 0, project: str = "mux"
) -> Session:
    caps = Capabilities(screen=True, conversation=True, keys=[], resize=True, terminate=True, rename=True)
    return Session(
        id=sid, name=sid, runtime="claude-code", cwd=cwd, source=SessionSource.LAUNCHED, machine=machine,
        capabilities=caps, state=AgentState.IDLE, state_source=StateSource.DEFAULT, needs_attention=False,
        auto_approve=False, can_auto_approve=False, created_at=T0 + timedelta(minutes=minutes),
        updated_at=T0, project="mux", project_source="set", matched_rule=None, pending=None, last_message=None,
        git=GitPlace(repo=repo, worktree=cwd, branch="main", remote=None) if repo else None,
    )  # fmt: skip


def _anchors(sessions: list[Session], anchors: ProjectAnchors | None = None) -> dict[str, str | None]:
    return {s.id: s.project_anchor for s in (anchors or ProjectAnchors()).apply(sessions)}


MUX = "/home/me/projects/mux"


def test_a_project_in_one_repository_sits_at_its_main_folder_worktrees_and_strays_included() -> None:
    found = _anchors([
        _s("a", MUX, MUX), _s("b", f"{MUX}-teams", MUX),  # a worktree counts as the repository
        _s("c", "/home/me/projects/other", "/home/me/projects/other"),  # one elsewhere: listed inside, no move
    ])  # fmt: skip
    assert set(found.values()) == {MUX}


def test_without_git_the_folder_most_run_in_and_none_without_folders() -> None:
    assert set(_anchors([_s("a", "/srv/x"), _s("b", "/srv/x"), _s("c", "/srv/y")]).values()) == {"/srv/x"}
    assert _anchors([_s("a", "")]) == {"a": None}


def test_a_tie_keeps_the_anchor_it_had_else_the_earliest_sessions() -> None:
    anchors = ProjectAnchors()
    one, two = "/r/one", "/r/two"
    assert set(_anchors([_s("late", two, two, minutes=5), _s("early", one, one)], anchors).values()) == {one}
    assert set(_anchors([_s("x", two, two), _s("y", two, two), _s("z", one, one)], anchors).values()) == {two}
    assert set(_anchors([_s("x", two, two), _s("z", one, one, minutes=-9)], anchors).values()) == {two}  # kept


def test_each_device_has_its_own() -> None:
    found = _anchors([_s("nas", MUX, MUX), _s("mac", "/Users/me/code/mux", "/Users/me/code/mux", machine="mac")])
    assert found == {"nas": MUX, "mac": "/Users/me/code/mux"}


def test_a_folder_named_project_is_no_project_node_and_gets_none() -> None:
    folder = _s("a", "/srv/x").model_copy(update={"project_source": "folder"})
    assert _anchors([folder]) == {"a": None}


def test_a_project_kept_before_its_source_was_is_told_by_its_name() -> None:
    from muxtower.sessions.decorate import _guessed_source

    assert _guessed_source("jiaton/lyric", "/home/me/projects") == "git remote"
    assert _guessed_source("projects", "/home/me/projects") == "folder"
    assert _guessed_source("shop", "/home/me/code") == "git root"
