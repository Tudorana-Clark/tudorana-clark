from fastapi import APIRouter, Depends, status

from ..deps import ContainerDep, require_admin
from ..models import (
    ArticleWork,
    ArticleWorkIn,
    CoverBriefRequest,
    CoverBriefs,
    DraftResult,
    Idea,
    IdeaIn,
    ImportPreview,
    ImportRequest,
    ImportSave,
    ImportSaved,
    LibrarySource,
    LibrarySourceIn,
    MineResult,
    Playbook,
    PlaybookIn,
    Post,
    PostCopy,
    PostIn,
    PostWriteRequest,
    ResearchRequest,
    ResearchResult,
    VoiceDraft,
    VoiceIn,
    VoiceProfile,
)

router = APIRouter(prefix="/v1/admin/studio", tags=["studio"], dependencies=[Depends(require_admin)])


@router.post("/cover-briefs", response_model=CoverBriefs)
async def cover_briefs(body: CoverBriefRequest, c: ContainerDep) -> CoverBriefs:
    return CoverBriefs(briefs=await c.studio.cover_briefs(body))


@router.get("/voice", response_model=VoiceProfile)
async def get_voice(c: ContainerDep) -> VoiceProfile:
    return await c.studio.voice()


@router.put("/voice", response_model=VoiceProfile)
async def put_voice(body: VoiceIn, c: ContainerDep) -> VoiceProfile:
    return await c.studio.save_voice(body)


@router.post("/voice/learn", response_model=VoiceDraft)
async def learn_voice(c: ContainerDep) -> VoiceDraft:
    return await c.studio.learn_voice()


@router.get("/ideas", response_model=list[Idea])
async def list_ideas(c: ContainerDep) -> list[Idea]:
    return await c.studio.ideas()


@router.post("/ideas", response_model=Idea, status_code=status.HTTP_201_CREATED)
async def add_idea(body: IdeaIn, c: ContainerDep) -> Idea:
    return await c.studio.add_idea(body)


@router.post("/ideas/mine", response_model=MineResult)
async def mine_ideas(c: ContainerDep) -> MineResult:
    return await c.studio.mine()


@router.delete("/ideas/{idea_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_idea(idea_id: str, c: ContainerDep) -> None:
    await c.studio.delete_idea(idea_id)


@router.get("/posts", response_model=list[Post])
async def list_posts(c: ContainerDep) -> list[Post]:
    return await c.studio.posts()


@router.post("/posts", response_model=Post, status_code=status.HTTP_201_CREATED)
async def create_post(body: PostIn, c: ContainerDep) -> Post:
    return await c.studio.create_post(body)


@router.get("/posts/{post_id}", response_model=Post)
async def get_post(post_id: str, c: ContainerDep) -> Post:
    return await c.studio.get_post(post_id)


@router.put("/posts/{post_id}", response_model=Post)
async def update_post(post_id: str, body: PostIn, c: ContainerDep) -> Post:
    return await c.studio.update_post(post_id, body)


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(post_id: str, c: ContainerDep) -> None:
    await c.studio.delete_post(post_id)


@router.post("/posts/write", response_model=PostCopy)
async def write_post(body: PostWriteRequest, c: ContainerDep) -> PostCopy:
    return await c.studio.write(body)


# ---------- Article workbench ----------


@router.get("/playbook", response_model=Playbook)
async def get_playbook(c: ContainerDep) -> Playbook:
    return await c.articles.playbook()


@router.put("/playbook", response_model=Playbook)
async def put_playbook(body: PlaybookIn, c: ContainerDep) -> Playbook:
    return await c.articles.save_playbook(body)


@router.get("/articles", response_model=list[ArticleWork])
async def list_articles(c: ContainerDep) -> list[ArticleWork]:
    return await c.articles.list_all()


@router.post("/articles", response_model=ArticleWork, status_code=status.HTTP_201_CREATED)
async def create_article(body: ArticleWorkIn, c: ContainerDep) -> ArticleWork:
    return await c.articles.create(body)


@router.get("/articles/{work_id}", response_model=ArticleWork)
async def get_article(work_id: str, c: ContainerDep) -> ArticleWork:
    return await c.articles.get(work_id)


@router.put("/articles/{work_id}", response_model=ArticleWork)
async def update_article(work_id: str, body: ArticleWorkIn, c: ContainerDep) -> ArticleWork:
    return await c.articles.update(work_id, body)


@router.delete("/articles/{work_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_article(work_id: str, c: ContainerDep) -> None:
    await c.articles.delete(work_id)


@router.post("/articles/{work_id}/outline", response_model=ArticleWork)
async def outline_article(work_id: str, c: ContainerDep) -> ArticleWork:
    return await c.articles.outline(work_id)


@router.post("/articles/{work_id}/research", response_model=ResearchResult)
async def research_article(work_id: str, body: ResearchRequest, c: ContainerDep) -> ResearchResult:
    return await c.articles.research(work_id, body)


@router.post("/articles/{work_id}/draft", response_model=DraftResult)
async def draft_article(work_id: str, c: ContainerDep) -> DraftResult:
    work, content = await c.articles.draft(work_id)
    return DraftResult(work=work, content=content)


@router.post("/articles/{work_id}/check", response_model=ArticleWork)
async def check_article(work_id: str, c: ContainerDep) -> ArticleWork:
    return await c.articles.check(work_id)


@router.post("/articles/{work_id}/distribute", response_model=list[Post])
async def distribute_article(work_id: str, c: ContainerDep) -> list[Post]:
    _, posts = await c.articles.distribute(work_id)
    return posts


# ---------- Sources library ----------


@router.get("/sources", response_model=list[LibrarySource])
async def list_sources(c: ContainerDep) -> list[LibrarySource]:
    return await c.library.list_all()


@router.post("/sources/import/preview", response_model=ImportPreview)
async def preview_import(body: ImportRequest, c: ContainerDep) -> ImportPreview:
    return await c.library.preview_import(body)


@router.post("/sources/import", response_model=ImportSaved)
async def save_import(body: ImportSave, c: ContainerDep) -> ImportSaved:
    return await c.library.save_import(body)


@router.post("/sources/check", response_model=list[LibrarySource])
async def check_sources(c: ContainerDep) -> list[LibrarySource]:
    return await c.library.check_batch()


@router.put("/sources/{source_id}", response_model=LibrarySource)
async def update_source(source_id: str, body: LibrarySourceIn, c: ContainerDep) -> LibrarySource:
    return await c.library.update(source_id, body)


@router.post("/sources/{source_id}/check", response_model=LibrarySource)
async def check_source(source_id: str, c: ContainerDep) -> LibrarySource:
    return await c.library.check(source_id)


@router.delete("/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source(source_id: str, c: ContainerDep) -> None:
    await c.library.delete(source_id)
