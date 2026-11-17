from fastapi import APIRouter, Query, Request

from muxtower.auth.deps import CurrentDevice
from muxtower.search.service import SearchResult, SearchService, SearchStatus

router = APIRouter(prefix="/v1", tags=["search"])


@router.get("/search/status")
def search_status(request: Request, _: CurrentDevice) -> SearchStatus:
    """Full-text search here (off, indexing, caught up, its size) and on each node."""
    service: SearchService = request.app.state.search
    return service.statuses()


@router.get("/search")
def search(
    request: Request, _: CurrentDevice, q: str = Query(min_length=1, max_length=200),
    limit: int = Query(default=20, ge=1, le=50), node: str | None = None,
) -> SearchResult:  # fmt: skip
    """What was said in the conversations, best matches first: prompts and replies of every session here
    and (a hub) on its nodes, archived ones too. A node too slow to answer is named in `late`; ask it alone
    with `node`."""
    service: SearchService = request.app.state.search
    return service.search(q, limit, node)
