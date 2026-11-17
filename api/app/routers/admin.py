from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, UploadFile, status

from ..deps import ContainerDep, SettingsDep, require_admin
from ..errors import DomainError
from ..models import (
    ContactMessage,
    Content,
    ContentIn,
    ContentList,
    ContentSummary,
    CoverRequest,
    CoverResult,
    Kind,
    MediaOut,
    SeoRequest,
    SeoSuggestion,
    Status,
    Subscriber,
)

router = APIRouter(prefix="/v1/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/content", response_model=ContentList)
async def list_all(c: ContainerDep, kind: Kind | None = None, limit: Annotated[int, Query(ge=1, le=500)] = 200) -> ContentList:
    rows = await c.repo.list_content(kind=kind, published_only=False, limit=limit)
    return ContentList(items=[ContentSummary.model_validate(r) for r in rows])


@router.get("/content/{content_id}", response_model=Content)
async def get_one(content_id: str, c: ContainerDep) -> Content:
    return await c.repo.find_by_id(content_id)


@router.post("/content", response_model=Content, status_code=status.HTTP_201_CREATED)
async def create(body: ContentIn, c: ContainerDep) -> Content:
    return await c.content.create(body)


@router.put("/content/{content_id}", response_model=Content)
async def update(content_id: str, body: ContentIn, c: ContainerDep) -> Content:
    return await c.content.update(content_id, body)


@router.post("/content/{content_id}/publish", response_model=Content)
async def publish(content_id: str, c: ContainerDep) -> Content:
    return await c.content.set_status(content_id, Status.published)


@router.post("/content/{content_id}/unpublish", response_model=Content)
async def unpublish(content_id: str, c: ContainerDep) -> Content:
    return await c.content.set_status(content_id, Status.draft)


@router.delete("/content/{content_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(content_id: str, c: ContainerDep) -> None:
    await c.content.delete(content_id)


@router.post("/ai/seo", response_model=SeoSuggestion)
async def ai_seo(body: SeoRequest, c: ContainerDep) -> SeoSuggestion:
    return await c.ai.generate(body)


@router.post("/ai/covers", response_model=CoverResult)
async def ai_covers(body: CoverRequest, c: ContainerDep) -> CoverResult:
    return await c.covers.generate(body)


@router.post("/media", response_model=MediaOut, status_code=status.HTTP_201_CREATED)
async def upload(c: ContainerDep, settings: SettingsDep, file: Annotated[UploadFile, File()]) -> MediaOut:
    data = await file.read(settings.media_max_bytes + 1)
    if len(data) > settings.media_max_bytes:
        raise DomainError(f"That file is over {settings.media_max_bytes // (1024 * 1024)} MB. Please upload a smaller one.")
    if not data:
        raise DomainError("That file is empty.")
    url, ctype = await c.media.put(data)
    return MediaOut(url=url, content_type=ctype, bytes=len(data))


@router.get("/subscribers", response_model=list[Subscriber])
async def subscribers(c: ContainerDep) -> list[Subscriber]:
    return await c.repo.list_subscribers()


@router.get("/messages", response_model=list[ContactMessage])
async def messages(c: ContainerDep) -> list[ContactMessage]:
    return await c.repo.list_messages()
