"""Content studio workflow: voice profile, idea bank (mined from published work) and short-form posts."""

from __future__ import annotations

import logging
import uuid

from pydantic import BaseModel, Field

from .errors import DomainError, NotFound
from .models import (
    Content,
    CoverBrief,
    CoverBriefRequest,
    Idea,
    IdeaIn,
    Kind,
    MineResult,
    Post,
    PostCopy,
    PostIn,
    PostStatus,
    PostWriteRequest,
    SourceRef,
    VoiceDraft,
    VoiceIn,
    VoiceProfile,
    utcnow,
)
from .repository import Repository
from .service import public_path
from .studio_ai import DEFAULT_VOICE, StudioWriter
from .studio_store import StudioStore
from .text import plain_text, word_count

log = logging.getLogger(__name__)

MINE_BATCH = 4  # pieces per click: bounds cost and keeps the request well under the gateway timeout
VOICE_SAMPLES = 8


class MinerState(BaseModel):
    id: str = "idea-miner"
    type: str = "state"
    # content id -> updated_at of the version that was mined, so edited pieces are mined again
    mined: dict[str, str] = Field(default_factory=dict)


def source_ref(c: Content) -> SourceRef:
    return SourceRef(content_id=c.id, kind=c.kind, title=c.title[:300], path=public_path(c.kind, c.slug))


class StudioService:
    def __init__(self, store: StudioStore, repo: Repository, writer: StudioWriter) -> None:
        self.store = store
        self.repo = repo
        self.writer = writer

    # ----- Cover briefs -----

    async def cover_briefs(self, req: CoverBriefRequest) -> list[CoverBrief]:
        # Short posts are fine: a title plus a sentence is enough to picture the idea.
        if word_count(f"{req.title} {req.body}") < 8:
            raise DomainError("Add a sentence or two about the idea first, so the cover ideas match it.")
        return await self.writer.cover_briefs(req.title, req.kind.value, req.body)

    # ----- Voice -----

    async def voice(self) -> VoiceProfile:
        return await self.store.get("voice", "voice", VoiceProfile) or VoiceProfile()

    async def voice_text(self) -> str:
        return (await self.voice()).guide or DEFAULT_VOICE

    async def save_voice(self, data: VoiceIn, learned_from: int | None = None) -> VoiceProfile:
        current = await self.voice()
        profile = VoiceProfile(guide=data.guide, learned_from=current.learned_from if learned_from is None else learned_from, updated_at=utcnow())
        await self.store.put(profile)
        return profile

    async def learn_voice(self) -> VoiceDraft:
        rows = await self.repo.list_content(kind=None, published_only=True, limit=40)
        written = [r for r in rows if r["kind"] in (Kind.article, Kind.research, Kind.note)] or rows
        samples: list[tuple[str, str]] = []
        for r in written[:VOICE_SAMPLES]:
            c = await self.repo.find_by_id(r["id"])
            if word_count(c.body) >= 60:
                samples.append((c.title, c.body))
        if not samples:
            raise DomainError("Publish at least one piece with a few paragraphs, then try again.")
        guide = await self.writer.learn_voice(samples)
        return VoiceDraft(guide=guide, learned_from=len(samples))

    # ----- Ideas -----

    async def ideas(self) -> list[Idea]:
        items = await self.store.list("idea", Idea, limit=300)
        return sorted(items, key=lambda i: (i.used_by is not None, -i.created_at.timestamp()))

    async def add_idea(self, data: IdeaIn) -> Idea:
        idea = Idea(id=uuid.uuid4().hex, text=data.text, angle=data.angle)
        await self.store.put(idea)
        return idea

    async def delete_idea(self, idea_id: str) -> None:
        await self.store.delete("idea", idea_id)

    async def mine(self) -> MineResult:
        state = await self.store.get("state", "idea-miner", MinerState) or MinerState()
        rows = await self.repo.list_content(kind=None, published_only=True, limit=500)
        pending = [r for r in rows if state.mined.get(r["id"]) != str(r["updated_at"])]
        voice = await self.voice_text()
        added = scanned = 0
        for r in pending[:MINE_BATCH]:
            c = await self.repo.find_by_id(r["id"])
            text = c.body or c.excerpt
            if word_count(text) >= 30:
                for idea_text, angle in await self.writer.mine_ideas(c.title, c.kind.value, text, voice):
                    await self.store.put(Idea(id=uuid.uuid4().hex, text=idea_text, angle=angle, source=source_ref(c)))
                    added += 1
            state.mined[c.id] = str(r["updated_at"])
            await self.store.put(state)  # saved per piece so a failure part-way loses nothing
            scanned += 1
        log.info("ideas_mined", extra={"added": added, "scanned": scanned, "remaining": len(pending) - scanned})
        return MineResult(added=added, scanned=scanned, remaining=max(0, len(pending) - scanned))

    # ----- Posts -----

    async def posts(self) -> list[Post]:
        return await self.store.list("post", Post, limit=300)

    async def get_post(self, post_id: str) -> Post:
        post = await self.store.get("post", post_id, Post)
        if post is None:
            raise NotFound("That post no longer exists.")
        return post

    async def create_post(self, data: PostIn) -> Post:
        post = Post(**data.model_dump(), id=uuid.uuid4().hex, posted_at=utcnow() if data.status == PostStatus.posted else None)
        await self.store.put(post)
        await self._mark_idea(data.idea_id, post.id)
        return post

    async def update_post(self, post_id: str, data: PostIn) -> Post:
        current = await self.get_post(post_id)
        posted_at = current.posted_at or (utcnow() if data.status == PostStatus.posted else None)
        post = Post(**data.model_dump(), id=current.id, created_at=current.created_at, updated_at=utcnow(), posted_at=posted_at)
        await self.store.put(post)
        return post

    async def delete_post(self, post_id: str) -> None:
        await self.store.delete("post", post_id)

    async def write(self, req: PostWriteRequest) -> PostCopy:
        source = ""
        if req.source_id:
            try:
                c = await self.repo.find_by_id(req.source_id)
                source = f"Title: {c.title}\n{plain_text(c.body or c.excerpt)[:8000]}"
            except NotFound:
                source = ""  # the piece was deleted; write from the seed alone
        return await self.writer.write_post(req.seed, source, await self.voice_text(), req.current, req.instruction)

    async def _mark_idea(self, idea_id: str | None, post_id: str) -> None:
        if not idea_id:
            return
        idea = await self.store.get("idea", idea_id, Idea)
        if idea and not idea.used_by:
            await self.store.put(idea.model_copy(update={"used_by": post_id}))
