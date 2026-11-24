"""An explicit project rename moves everything the hub keeps by the project's name, in one transaction: chip
groups, the order of projects (same place), its colour, its playbook and triggers' targets. A plain move
changes only the session. A rename asked through a node runs on the hub."""

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.chips.project_colours import ProjectColour
from muxtower.chips.project_order import ProjectOrder
from muxtower.chips.service import ChipGroup, ChipGroups
from muxtower.playbook.service import PutPlaybook
from muxtower.sessions.models import CreateSession
from muxtower.triggers.models import DeliverAction, StartAction, TriggerSpec


class Hub:
    def __init__(self, app: FastAPI, tmp_path: Path) -> None:
        self.app = app
        self.client = TestClient(app)
        _, token = app.state.tokens.create("phone")
        self.auth = {"Authorization": f"Bearer {token}"}
        self.ids: dict[str, str] = {}
        for name, project in (("lead", "acme/shop"), ("worker", "acme/shop"), ("other", "acme/web")):
            made = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name=name))
            app.state.teams.set_project(made.id, project)
            self.ids[name] = made.id
        app.state.chip_groups.replace(
            ChipGroups(groups=[
                ChipGroup(id="g1", name="Shop", projects=["acme/shop", "acme/web"]),
                ChipGroup(id="g2", name="Rest", projects=["acme/web"]),
            ])
        )  # fmt: skip
        app.state.project_order.replace(ProjectOrder(projects=["acme/web", "acme/shop", "acme/docs"]))
        app.state.project_colours.choose(ProjectColour(project="acme/shop", hue=4))
        app.state.project_colours.choose(ProjectColour(project="acme/web", hue=2))
        app.state.playbook.put("projects/acme/shop", PutPlaybook(text="- ship on Fridays", base_version=0), "owner")
        triggers = app.state.triggers
        triggers.create(TriggerSpec(name="deals", action=DeliverAction(to="pm@Acme/Shop")))
        triggers.create(TriggerSpec(name="nightly", action=StartAction(project="acme/shop", message="Build it")))
        triggers.create(TriggerSpec(name="docs", action=DeliverAction(to="pm@acme/web")))

    def rename(self, session: str, project: str, rename: bool = True) -> Any:
        body = {"project": project, "rename_project": rename}
        return self.client.put(f"/v1/sessions/{self.ids[session]}/team", json=body, headers=self.auth)

    def kept(self) -> dict[str, Any]:
        """Everything kept by project name, as stored."""
        state = self.app.state
        with state.teams.repo.db.connect() as conn:
            rows = conn.execute("SELECT session_id, project FROM session_team ORDER BY session_id").fetchall()
        return {
            "teams": {r["session_id"]: r["project"] for r in rows},
            "members": {sid: state.teams.find(sid).project for sid in self.ids.values()},
            "groups": [g.projects for g in state.chip_groups.load().groups],
            "order": state.project_order.load().projects,
            "hues": state.project_colours.load().hues,
            "playbooks": [p.scope for p in state.playbook.projects()],
            "versions": [v.scope for v in state.playbook.versions("projects/acme/store")],
            "triggers": {t.name: t.action.model_dump() for t in state.triggers.all()},
        }


@pytest.fixture
def hub(make_app: Callable[..., FastAPI], tmp_path: Path) -> Hub:
    return Hub(make_app(), tmp_path)


def test_a_rename_moves_everything_kept_by_the_name(hub: Hub) -> None:
    assert hub.rename("lead", "acme/store").status_code == 200
    kept = hub.kept()
    lead, worker, other = hub.ids["lead"], hub.ids["worker"], hub.ids["other"]
    assert kept["members"] == {lead: "acme/store", worker: "acme/store", other: "acme/web"}
    assert set(kept["teams"].values()) == {"acme/store", "acme/web"}
    assert kept["groups"] == [["acme/store", "acme/web"], ["acme/web"]]
    assert kept["order"] == ["acme/web", "acme/store", "acme/docs"]  # in its place
    assert kept["hues"] == {"acme/store": 4, "acme/web": 2}  # the hue moves with the name
    assert kept["playbooks"] == ["projects/acme/store"] and kept["versions"] == ["projects/acme/store"]
    assert hub.app.state.playbook.effective("acme/store")[0].text == "- ship on Fridays"
    triggers = kept["triggers"]
    assert triggers["deals"]["to"] == "pm@acme/store" and triggers["nightly"]["project"] == "acme/store"
    assert triggers["docs"]["to"] == "pm@acme/web"


def test_a_rename_into_an_existing_project_keeps_its_hue_and_playbook(hub: Hub) -> None:
    hub.app.state.playbook.put("projects/acme/web", PutPlaybook(text="- web's own", base_version=0), "owner")
    assert hub.rename("lead", "acme/web").status_code == 200
    kept = hub.kept()
    assert set(kept["members"].values()) == {"acme/web"}
    assert kept["groups"] == [["acme/web"], ["acme/web"]]  # once
    assert kept["order"] == ["acme/web", "acme/docs"]  # the renamed one's place; it was the later one
    assert kept["hues"] == {"acme/web": 2}  # the target's hue, the old row gone
    assert kept["playbooks"] == ["projects/acme/shop", "projects/acme/web"]  # both stay as they are


def test_a_failure_partway_rolls_back_everything(hub: Hub, monkeypatch: pytest.MonkeyPatch) -> None:
    before = hub.kept()

    def broken(old: str, new: str) -> list[str]:
        raise RuntimeError("disk full")

    monkeypatch.setattr(hub.app.state.triggers, "rename_project", broken)  # the last store, after the others wrote
    with pytest.raises(RuntimeError):
        hub.app.state.teams.set_project(hub.ids["lead"], "acme/store", rename=True)
    assert hub.kept() == before


def test_a_plain_move_changes_only_the_session(hub: Hub) -> None:
    before = hub.kept()
    assert hub.rename("lead", "acme/store", rename=False).status_code == 200
    after = hub.kept()
    assert after["members"][hub.ids["lead"]] == "acme/store" and after["members"][hub.ids["worker"]] == "acme/shop"
    assert {k: v for k, v in after.items() if k not in ("teams", "members")} == {
        k: v for k, v in before.items() if k not in ("teams", "members")
    }


def test_the_lists_are_told_after_the_commit(hub: Hub) -> None:
    told: list[str] = []
    hub.app.state.teams.renames.publish = told.append
    hub.rename("lead", "acme/store")
    assert told == ["chip-groups", "project-order", "project-colours", "playbook", "triggers"]


async def test_a_rename_asked_through_a_node_runs_on_the_hub(hub: Hub) -> None:
    from muxtower.nodes import asked

    arguments = {"project": "acme/store", "rename": True, "session_id": hub.ids["worker"]}
    frame = {"id": 1, "method": "team_tool", "params": {"tool": "set_project", "arguments": arguments}}
    reply = json.loads(await asked.answer(hub.app.state.mcp, "mac", frame))
    assert reply["result"]["text"] == "Project renamed to acme/store for 2 sessions."
    kept = hub.kept()
    assert kept["groups"][0] == ["acme/store", "acme/web"] and kept["hues"]["acme/store"] == 4


def test_a_node_asks_its_hub_to_rename(make_app: Callable[..., FastAPI], tmp_path: Path) -> None:
    """The app's rename on a node's own API goes to the hub (as the session's set_project would), not here."""
    node = Hub(make_app(), tmp_path)
    asked: list[tuple[str, dict[str, Any], str | None]] = []
    node.app.state.hub.team_tool = lambda tool, args, sid: asked.append((tool, args, sid)) or "Project renamed"
    before = node.kept()
    assert node.rename("lead", "acme/store").status_code == 200
    assert asked == [("set_project", {"project": "acme/store", "rename": True}, node.ids["lead"])]
    assert node.kept() == before  # nothing renamed on the node itself
    node.rename("lead", "acme/store", rename=False)  # a plain move stays the node's own
    assert len(asked) == 1
