from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from ..deps import ContainerDep, client_key, public_writes
from ..errors import NotFound
from ..models import ContactIn, Content, ContentList, ContentSummary, Kind, Status, SubscribeIn
from ..service import contact, subscribe

router = APIRouter(prefix="/v1", tags=["public"])


@router.get("/content", response_model=ContentList)
async def list_published(
    c: ContainerDep,
    kind: Kind | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> ContentList:
    rows = await c.repo.list_content(kind=kind, published_only=True, limit=limit)
    return ContentList(items=[ContentSummary.model_validate(r) for r in rows])


@router.get("/content/{slug}", response_model=Content)
async def get_published(slug: str, c: ContainerDep) -> Content:
    item = await c.repo.get_by_slug(slug)
    if item is None or item.status != Status.published:
        raise NotFound("We couldn’t find that page.")
    return item


@router.post("/subscribe", status_code=status.HTTP_200_OK)
async def post_subscribe(body: SubscribeIn, c: ContainerDep, key: Annotated[str, Depends(client_key)]) -> dict[str, bool]:
    public_writes.check(f"sub:{key}")
    created = await subscribe(c.repo, body.email, body.source)
    # Same response either way: don't reveal whether an address is already on the list.
    return {"ok": True, "new": created}


@router.post("/contact", status_code=status.HTTP_202_ACCEPTED)
async def post_contact(body: ContactIn, c: ContainerDep, key: Annotated[str, Depends(client_key)]) -> dict[str, bool]:
    public_writes.check(f"contact:{key}")
    await contact(c.repo, body)
    return {"ok": True}
