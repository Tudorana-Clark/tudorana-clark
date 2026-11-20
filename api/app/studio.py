"""Content studio workflow: voice profile, idea bank (mined from published work) and short-form posts."""

from __future__ import annotations

import asyncio
import logging
import time
import uuid

from pydantic import BaseModel, Field

from .copy_engine import CopyEngine, fix_list, needs_revision, post_fingerprint
from .errors import DomainError, NotFound, UpstreamUnavailable
from .models import (
    Content,
    CopyScore,
    CoverBrief,
    CoverBriefRequest,
    Idea,
    IdeaIn,
    Kind,
    MineResult,
    Post,
    PostCopy,
    PostIn,
    PostScoreRequest,
    PostStatus,
    PostWriteRequest,
    PostWriteResult,
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

# Start the automatic second pass only within this time of starting, and finish everything by the deadline,
# which sits safely inside the studio's 230 s wait. If the pass runs out of time, the first version is kept.
REVISE_BUDGET_SECONDS = 100
FIX_ALL_LIMIT = 12  # "Apply all fixes" covers every open suggestion the rubric can raise, not just the top six
DEADLINE_SECONDS = 200
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
    def __init__(self, store: StudioStore, repo: Repository, writer: StudioWriter, engine: CopyEngine) -> None:
        self.store = store
        self.repo = repo
        self.writer = writer
        self.engine = engine

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
        post = Post(
            **data.model_dump(exclude={"score"}),
            score=_marked(data.score, data.linkedin, data.x),
            id=uuid.uuid4().hex,
            posted_at=utcnow() if data.status == PostStatus.posted else None,
        )
        await self.store.put(post)
        await self._mark_idea(data.idea_id, post.id)
        return post

    async def update_post(self, post_id: str, data: PostIn) -> Post:
        current = await self.get_post(post_id)
        posted_at = current.posted_at or (utcnow() if data.status == PostStatus.posted else None)
        post = Post(
            **data.model_dump(exclude={"score"}),
            score=_marked(data.score, data.linkedin, data.x),
            id=current.id,
            created_at=current.created_at,
            updated_at=utcnow(),
            posted_at=posted_at,
        )
        await self.store.put(post)
        return post

    async def delete_post(self, post_id: str) -> None:
        await self.store.delete("post", post_id)

    async def write(self, req: PostWriteRequest) -> PostWriteResult:
        """Write (or revise) drafts, score them, and for a fresh draft fix what scored badly in one automatic pass."""
        started = time.monotonic()
        source = ""
        if req.source_id:
            try:
                c = await self.repo.find_by_id(req.source_id)
                source = f"Title: {c.title}\n{plain_text(c.body or c.excerpt)[:8000]}"
            except NotFound:
                source = ""  # the piece was deleted; write from the seed alone
        voice = await self.voice_text()
        if req.fix_all and req.current is not None:
            return await self.fix_all(req.current, req.seed, source, voice)
        copy = await self.writer.write_post(req.seed, source, voice, req.current, req.instruction)
        score = await self.engine.score_post(copy, "", voice)
        if req.current is None:
            copy, score = await self.polish(copy, score, req.seed, source, voice, "", started)
        return PostWriteResult(**copy.model_dump(), score=score)

    async def fix_all(self, current: PostCopy, seed: str, source: str, voice: str) -> PostWriteResult:
        """Rescore the drafts, revise them against every open suggestion in one pass, and keep the better version.

        The score is taken fresh rather than trusted from the client, so the fixes match the text being revised.
        `score.revised` tells the caller whether the rewrite was kept.
        """
        score = await self.engine.score_post(current, "", voice)
        brief = fix_list(score, limit=FIX_ALL_LIMIT)
        if not brief:
            return PostWriteResult(**current.model_dump(), score=score)
        revised = await self.writer.write_post(seed, source, voice, current, brief)
        again = await self.engine.score_post(revised, "", voice)
        log.info("post_fix_all", extra={"before": score.total, "after": again.total})
        if again.total >= score.total:
            return PostWriteResult(**revised.model_dump(), score=again.model_copy(update={"revised": True, "first_total": score.total}))
        return PostWriteResult(**current.model_dump(), score=score)

    async def polish(self, copy: PostCopy, score: CopyScore, seed: str, source: str, voice: str, role: str, started: float) -> tuple[PostCopy, CopyScore]:
        """One automatic revision aimed at the weakest criteria. Keeps whichever version scores higher."""
        brief = fix_list(score)
        if not needs_revision(score) or not brief or time.monotonic() - started > REVISE_BUDGET_SECONDS:
            return copy, score

        async def second_pass() -> tuple[PostCopy, CopyScore]:
            revised = await self.writer.write_post(seed, source, voice, copy, brief)
            if role == "link":
                revised = _keep_link(copy, revised)
            return revised, await self.engine.score_post(revised, role, voice)

        try:
            revised, again = await asyncio.wait_for(second_pass(), timeout=max(5.0, DEADLINE_SECONDS - (time.monotonic() - started)))
        except (UpstreamUnavailable, DomainError, TimeoutError) as exc:
            log.warning("post_polish_skipped", extra={"error": str(exc)})
            return copy, score
        log.info("post_polished", extra={"before": score.total, "after": again.total})
        if again.total >= score.total:
            return revised, again.model_copy(update={"revised": True, "first_total": score.total})
        return copy, score

    async def score(self, req: PostScoreRequest) -> CopyScore:
        return await self.engine.score_post({"linkedin": req.linkedin, "x": req.x}, req.role, await self.voice_text())

    async def polish_many(self, items: list[tuple[str, PostCopy]], seed: str, source: str) -> list[tuple[PostCopy, CopyScore | None]]:
        """Score and polish several posts at once (an article's distribution plan). A failure leaves that post unscored."""
        voice = await self.voice_text()
        started = time.monotonic()

        async def one(role: str, copy: PostCopy) -> tuple[PostCopy, CopyScore | None]:
            try:
                score = await self.engine.score_post(copy, role, voice)
                return await self.polish(copy, score, f"{seed} ({role.replace('_', ' ')} post)", source, voice, role, started)
            except (UpstreamUnavailable, DomainError) as exc:
                log.warning("post_score_failed", extra={"role": role, "error": str(exc)})
                return copy, None

        return list(await asyncio.gather(*(one(role, copy) for role, copy in items)))

    async def _mark_idea(self, idea_id: str | None, post_id: str) -> None:
        if not idea_id:
            return
        idea = await self.store.get("idea", idea_id, Idea)
        if idea and not idea.used_by:
            await self.store.put(idea.model_copy(update={"used_by": post_id}))


def _marked(score: CopyScore | None, linkedin: str, x: str) -> CopyScore | None:
    """Flag a stored score as stale once the text it scored has been edited."""
    if score is None:
        return None
    return score.model_copy(update={"stale": score.fingerprint != post_fingerprint(linkedin, x)})


def _keep_link(original: PostCopy, revised: PostCopy) -> PostCopy:
    """The launch post must keep the article URL even if a revision drops it."""
    urls = [w for w in original.linkedin.split() if w.startswith("http")]
    if urls and urls[0] not in revised.linkedin:
        revised = revised.model_copy(update={"linkedin": f"{revised.linkedin.rstrip()}\n\n{urls[0]}"[:3000]})
    if "http" in original.x and "http" not in revised.x:
        revised = revised.model_copy(update={"x": original.x})
    return revised
