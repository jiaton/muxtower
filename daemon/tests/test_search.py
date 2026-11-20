"""Full-text search: prompts and replies only, capped; read on from where it stopped, within a budget, never
again from the start after a restart; CJK found by any two characters; a node's answers merged, a slow node
named rather than waited on."""

import json
import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.claude_conversation import SLOTS
from muxtower.runtimes.models import AgentState
from muxtower.search.index import SearchIndex, Source
from muxtower.search.indexer import Indexer
from muxtower.search.service import SearchService
from muxtower.search.text import CAP, Row, match_query, split, unsplit
from muxtower.sessions.models import ConversationItem, ConversationItemKind, CreateSession


def _line(kind: str, text: str | None = None, tool_result: str | None = None) -> str:
    if kind == "user" and tool_result is not None:
        content: Any = [{"type": "tool_result", "tool_use_id": "t1", "content": tool_result}]
    elif kind == "assistant":
        content = [{"type": "text", "text": text}, {"type": "tool_use", "id": "t1", "name": "Bash", "input": {}}]
    else:
        content = text
    return json.dumps(
        {"type": kind, "timestamp": "2026-11-16T10:00:00Z", "message": {"role": kind, "content": content}}
    )


class Directory:
    """The sessions an indexer sees: transcripts by session, conversations by session."""

    def __init__(self) -> None:
        self.paths: dict[str, str] = {}
        self.items: dict[str, list[ConversationItem]] = {}
        self.state = AgentState.IDLE
        self.local = SimpleNamespace(
            repo=SimpleNamespace(get=lambda sid: object() if sid in self.paths else None),
            transcript_of=lambda sid: self.paths.get(sid),
        )

    def list(self) -> list[Any]:
        now = datetime.now(UTC)
        ids = [*self.paths, *self.items]
        return [
            SimpleNamespace(id=i, node=None, archived_at=None, state=self.state, updated_at=now,
                            capabilities=SimpleNamespace(conversation=i in self.items))
            for i in ids
        ]  # fmt: skip

    def recent(self, max_age: float) -> "list[Any]":
        return self.list()

    def conversation(self, sid: str, after: int, limit: int) -> Any:
        return SimpleNamespace(items=self.items[sid])

    def find(self, sid: str) -> Any:
        return SimpleNamespace(id=sid, archived_at=None) if sid in {*self.paths, *self.items} else None


def _indexer(tmp_path: Path, d: Directory, budget: int = 10_000_000, on: Callable[[], bool] = lambda: True) -> Indexer:
    return Indexer(SearchIndex(tmp_path / "search.db"), d, None, on, budget=budget)


def test_text_is_split_for_cjk_and_matched_by_word_start() -> None:
    assert match_query("deplo api") == '"deplo"* "api"*'
    assert match_query("下单 test") == '"下 单" "test"*'
    assert match_query('" * -') is None
    assert unsplit(split("请把\x02下单\x03的逻辑 fix")) == "请把\x02下单\x03的逻辑 fix"


def test_only_prompts_and_replies_are_indexed_capped_with_their_conversation_seq(tmp_path: Path) -> None:
    path = tmp_path / "t.jsonl"
    lines = [
        _line("user", "please deploy the billing page"),
        _line("assistant", "Deployed, " + "x" * 5000),
        _line("user", tool_result="SECRET-LOG " * 1000),  # a tool's output: never indexed
        _line("user", "再检查一下下单流程"),
    ]
    path.write_text("\n".join(lines) + "\n")
    d = Directory()
    d.paths["s1"] = str(path)
    indexer = _indexer(tmp_path, d)
    assert indexer.tick() == 3
    index = indexer.index
    hit = index.search("deploy")
    assert {(f.session, f.seq, f.role) for f in hit} == {("s1", 1 * SLOTS, "user"), ("s1", 2 * SLOTS, "agent")}
    assert index.search("SECRET") == []
    assert [f.seq for f in index.search("下单")] == [4 * SLOTS]  # two characters, found
    assert "\x02下单\x03" in index.search("下单")[0].snippet
    rows = index._writer().execute("SELECT length(body) FROM items WHERE role = 'agent'").fetchone()
    assert rows[0] <= CAP + 10


def test_backfill_is_spread_out_resumes_after_a_restart_and_follows_what_is_appended(tmp_path: Path) -> None:
    path = tmp_path / "t.jsonl"
    path.write_text("".join(_line("user", f"message number {i}") + "\n" for i in range(40)))
    d = Directory()
    d.paths["s1"] = str(path)
    first = _indexer(tmp_path, d, budget=1500)  # a few lines a tick
    assert 0 < first.tick() < 40
    added = first.rows
    again = _indexer(tmp_path, d, budget=1500)  # a restart: on from where it stopped
    while again.tick():
        pass
    assert added + again.rows == 40 and len(again.index.search("number", 50)) == 40
    assert again.tick() == 0  # nothing new: nothing read again
    with path.open("a") as f:
        f.write(_line("assistant", "appended reply about kubernetes") + "\n")
        f.write('{"type": "user", "message": {"role": "user", "content": "half a li')  # still being written
    assert again.tick() == 1
    assert again.index.search("kubernetes")[0].seq == 41 * SLOTS
    path.write_text(_line("user", "rewritten from scratch") + "\n")  # shorter: read again from the start
    again.tick()
    assert again.index.search("number") == [] and again.index.search("scratch")


def test_reads_slower_while_a_session_works(tmp_path: Path) -> None:
    path = tmp_path / "t.jsonl"
    path.write_text("".join(_line("user", f"message {i}") + "\n" for i in range(40)))
    d = Directory()
    d.paths["s1"] = str(path)
    d.state = AgentState.BUSY
    busy = _indexer(tmp_path, d, budget=4000)
    busy.tick()
    assert busy.read_bytes <= 1000 + 200  # a quarter of the budget


def test_conversations_without_a_transcript_and_sessions_gone(tmp_path: Path) -> None:
    d = Directory()
    at = datetime.now(UTC)
    d.items["rc1"] = [
        ConversationItem(seq=7, at=at, kind=ConversationItemKind.PROMPT, text="check the 操盘手 report"),
        ConversationItem(seq=8, at=at, kind=ConversationItemKind.TOOL, text="ls -la"),
    ]
    indexer = _indexer(tmp_path, d)
    indexer.tick()
    assert [(f.session, f.seq) for f in indexer.index.search("操盘")] == [("rc1", 7)]
    assert indexer.index.search("la") == []  # a tool, not indexed
    d.items.clear()
    for _ in range(12):
        indexer.tick()
    assert indexer.index.search("report") == []  # its session is gone: so is it


def test_turned_off_the_index_is_deleted(tmp_path: Path) -> None:
    path = tmp_path / "t.jsonl"
    path.write_text(_line("user", "hello there") + "\n")
    d = Directory()
    d.paths["s1"] = str(path)
    on = {"v": True}
    indexer = _indexer(tmp_path, d, on=lambda: on["v"])
    indexer.tick()
    assert (tmp_path / "search.db").exists()
    on["v"] = False
    assert indexer.tick() == 0 and not (tmp_path / "search.db").exists()


def test_a_hub_merges_its_nodes_answers_and_names_a_late_one(tmp_path: Path) -> None:
    index = SearchIndex(tmp_path / "search.db")
    index.add(Source("file:a", "here1", 0, 0, None), [Row(10, None, "user", "deploy the hub")])
    nodes: dict[str, Any] = {
        "mac": SimpleNamespace(
            online=True, sessions={"m1": SimpleNamespace(id="m1", source="launched", archived_at=None)}
        ),
        "silly": SimpleNamespace(online=True, sessions={}),
    }

    def call(name: str, method: str, params: dict[str, Any], timeout: float) -> Any:
        assert method == "search"
        if name == "silly":
            time.sleep(1)  # too slow
        return [{"session": "m1", "seq": 20, "at": None, "role": "agent", "snippet": "\x02deploy\x03ed", "rank": -1.0}]

    source = SimpleNamespace(nodes=SimpleNamespace(all=lambda: nodes), call=call)
    directory = SimpleNamespace(find=lambda sid: SimpleNamespace(id=sid, archived_at=None))
    service = SearchService(index, directory, lambda: True, source)
    found = service.search("deploy")
    assert {h.session_id for h in found.hits} == {"here1", "mac~m1"} and found.late == ["silly"]
    mac = next(h for h in found.hits if h.node == "mac")
    assert [(p.text, p.match) for p in mac.snippet] == [("deploy", True), ("ed", False)]
    assert found.took_ms < 900  # not held up by the late one


def test_the_route_answers_with_hits_on_known_sessions(make_app: Callable[..., FastAPI], tmp_path: Path) -> None:
    app = make_app()
    _, token = app.state.tokens.create("phone")
    made = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="w"))
    app.state.search.index.add(Source("file:x", made.id, 0, 0, None), [Row(30, None, "agent", "the chart library")])
    res = TestClient(app).get("/v1/search", params={"q": "chart"}, headers={"Authorization": f"Bearer {token}"})
    body = res.json()
    assert res.status_code == 200 and [(h["session_id"], h["seq"], h["role"]) for h in body["hits"]] == [
        (made.id, 30, "agent")
    ]
    assert body["hits"][0]["snippet"][0]["match"] is False and body["off"] is False


def test_a_hit_further_back_than_the_latest_kept_is_read_where_it_is(tmp_path: Path) -> None:
    from muxtower.sessions.transcripts import Transcripts

    path = tmp_path / "long.jsonl"
    path.write_text(
        "".join(_line("user" if i % 2 else "assistant", f"line {i} about item {i}") + "\n" for i in range(1, 1201))
    )
    found = Transcripts().window("s1", str(path), 7 * SLOTS, 5)
    assert [i.seq for i in found.items][:1] == [7 * SLOTS] and found.items[0].text == "line 7 about item 7"
    assert len(found.items) == 5


def test_on_by_default_on_a_hub_off_on_a_node_and_each_says_how_far_it_got(
    make_app: Callable[..., FastAPI], tmp_path: Path
) -> None:
    app = make_app()
    _, token = app.state.tokens.create("phone")
    auth = {"Authorization": f"Bearer {token}"}
    client = TestClient(app)
    assert client.get("/v1/search/status", headers=auth).json()["here"]["state"] == "indexing"  # a hub: on
    app.state.indexer.tick()
    assert client.get("/v1/search/status", headers=auth).json()["here"]["state"] == "caught_up"
    (tmp_path / "state" / "hub.json").write_text(
        json.dumps({"url": "https://hub.example", "name": "mac", "token": "x"})
    )
    status = client.get("/v1/search/status", headers=auth).json()["here"]
    assert status == {"state": "off", "size_bytes": 0}  # a node: off until turned on there
    assert client.get("/v1/search", params={"q": "x"}, headers=auth).json()["off"] is True


def test_a_hub_shows_each_node_s_index() -> None:
    index = SearchIndex(Path("/nonexistent/search.db"))
    nodes = {"mac": SimpleNamespace(online=True, sessions={}), "silly": SimpleNamespace(online=False, sessions={})}
    source = SimpleNamespace(
        nodes=SimpleNamespace(all=lambda: nodes),
        call=lambda name, method, params, timeout: {"state": "caught_up", "size_bytes": 5_000_000},
    )
    service = SearchService(index, SimpleNamespace(), lambda: True, source)
    status = service.statuses()
    assert [(n.node, n.status.state if n.status else None) for n in status.nodes] == [
        ("mac", "caught_up"),
        ("silly", None),
    ]
