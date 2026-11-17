"""Full-text search over the conversations: this daemon's index, and on a hub each node's, asked at once
and given a short while (`NODE_SECONDS`): a node slower than that is said to be late (the app asks it alone
then, `node=`), never waited on."""

import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, wait
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from muxtower.search.index import Found, SearchIndex
from muxtower.search.text import END, HIT

NODE_SECONDS = 0.3  # a node's answer, when asked with the others
ONE_NODE_SECONDS = 3.0  # a node asked alone (it was late)


class IndexStatus(BaseModel):
    state: Literal["off", "indexing", "caught_up"]
    size_bytes: int = 0


class NodeIndexStatus(BaseModel):
    node: str
    status: IndexStatus | None = Field(default=None, description="None: offline, or too old to say")


class SearchStatus(BaseModel):
    here: IndexStatus
    nodes: list[NodeIndexStatus] = Field(default_factory=list)


class SnippetPart(BaseModel):
    text: str
    match: bool = Field(default=False, description="this part is what was searched for")


class SearchHit(BaseModel):
    session_id: str = Field(description="as the session list has it (a node's: <node>~<id>)")
    seq: int = Field(description="the conversation item it is in (GET /conversation)")
    at: datetime | None = None
    role: Literal["user", "agent"]
    snippet: list[SnippetPart]
    archived: bool = False
    node: str | None = None


class SearchResult(BaseModel):
    hits: list[SearchHit]
    late: list[str] = Field(default_factory=list, description="nodes that did not answer in time: ask each with node=")
    off: bool = Field(default=False, description="full-text search is turned off here (`search.full_text`)")
    took_ms: float = 0


def _at(value: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None
    except ValueError:
        return None


def parts(snippet: str) -> list[SnippetPart]:
    out: list[SnippetPart] = []
    for i, chunk in enumerate(snippet.replace(END, HIT).split(HIT)):
        if chunk:
            out.append(SnippetPart(text=chunk, match=i % 2 == 1))
    return out


class SearchService:
    def __init__(self, index: SearchIndex, directory: Any, enabled: Callable[[], bool], nodes: Any = None) -> None:
        self.index = index
        self.directory = directory
        self.enabled = enabled
        self.nodes = nodes  # a hub's NodeSource
        self._pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="search-nodes")
        self.indexer: Any = None  # set by the app: how far it got

    def status(self) -> IndexStatus:
        """This daemon's index: off, still indexing, or caught up; its size."""
        if not self.enabled():
            return IndexStatus(state="off")
        caught_up = bool(self.indexer and self.indexer.caught_up)
        return IndexStatus(state="caught_up" if caught_up else "indexing", size_bytes=self.index.size())

    def statuses(self) -> SearchStatus:
        """Here, and (a hub) each node's, asked at once; an offline or old node says nothing."""
        names = sorted(self.nodes.nodes.all()) if self.nodes is not None else []
        online = set(self._online())
        asked = {name: self._pool.submit(self.nodes.call, name, "search_status", {"session_id": ""}, 2.0)
                 for name in names if name in online}  # fmt: skip
        out = []
        for name in names:
            try:
                raw = asked[name].result(timeout=2.5) if name in asked else None
                out.append(NodeIndexStatus(node=name, status=IndexStatus.model_validate(raw) if raw else None))
            except Exception:  # noqa: BLE001 - too old to know the method, or not answering
                out.append(NodeIndexStatus(node=name))
        return SearchStatus(here=self.status(), nodes=out)

    def local(self, q: str, limit: int) -> list[dict[str, Any]]:
        """This daemon's own matches, as a node answers its hub."""
        if not self.enabled():
            return []
        return [f.__dict__ for f in self.index.search(q, limit)]

    def _hit(self, found: Found, session: Any, session_id: str, node: str | None) -> SearchHit:
        return SearchHit(
            session_id=session_id, seq=found.seq, at=_at(found.at), role="user" if found.role == "user" else "agent",
            snippet=parts(found.snippet), archived=bool(session is not None and session.archived_at), node=node,
        )  # fmt: skip

    def search(self, q: str, limit: int = 20, node: str | None = None) -> SearchResult:
        started = time.perf_counter()
        ranked: list[tuple[float, SearchHit]] = []
        late: list[str] = []
        if node is None:
            if not self.enabled():
                return SearchResult(hits=[], off=True)
            for found in self.index.search(q, limit):
                session = self.directory.find(found.session)
                if session is not None:
                    ranked.append((found.rank, self._hit(found, session, session.id, None)))
        names = [node] if node else self._online()
        if names and self.nodes is not None:
            timeout = ONE_NODE_SECONDS if node else NODE_SECONDS
            asked = {self._pool.submit(self._ask, name, q, limit, timeout): name for name in names}
            done, pending = wait(asked, timeout=timeout)
            late = sorted(asked[f] for f in pending)
            for future in done:
                try:
                    ranked += future.result()
                except Exception:  # noqa: BLE001 - a node that failed is left out, like a late one
                    late.append(asked[future])
        ranked.sort(key=lambda r: r[0])  # bm25: the lower, the better
        hits = [h for _, h in ranked][:limit]
        return SearchResult(hits=hits, late=late, took_ms=round((time.perf_counter() - started) * 1000, 1))

    def _online(self) -> list[str]:
        if self.nodes is None:
            return []
        return [name for name, n in self.nodes.nodes.all().items() if n.online]

    def _ask(self, name: str, q: str, limit: int, timeout: float) -> list[tuple[float, SearchHit]]:
        from muxtower.nodes.source import hub_id

        answered = self.nodes.call(name, "search", {"session_id": "", "q": q, "limit": limit}, timeout) or []
        node = self.nodes.nodes.all().get(name)
        out = []
        for raw in answered:
            found = Found(**raw)
            session = node.sessions.get(found.session) if node else None
            sid = hub_id(name, session) if session is not None else f"{name}~{found.session}"
            out.append((found.rank, self._hit(found, session, sid, name)))
        return out
