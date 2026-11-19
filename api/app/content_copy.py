"""The copy engine for anything in Content, however it was made (written by hand, imported, or drafted in Write).

Scores the body against the rubric for its kind and the piece's LinkedIn and X copy against the post rubric,
keeps the latest scores privately in the studio store (never on the public content record), and rewrites the
body to apply the suggestions. A rewrite is returned to the editor for review; nothing is saved or published
until DTC saves it.
"""

from __future__ import annotations

import asyncio
import logging

from .article_ai import ArticleWriter
from .copy_engine import CopyEngine, fingerprint, fix_list, post_fingerprint
from .errors import Conflict, DomainError, NotFound
from .models import ContentReviseRequest, ContentRevision, ContentScoreRequest, ContentScores, ContentScoreSummary, CopyScore, PostCopy, utcnow
from .repository import Repository
from .studio import StudioService
from .studio_store import StudioStore
from .text import word_count

log = logging.getLogger(__name__)

# One rewrite pass has to fit in a single model response; longer pieces get their fixes by hand.
MAX_REVISE_WORDS = 4000


class ContentCopyService:
    def __init__(self, store: StudioStore, repo: Repository, studio: StudioService, writer: ArticleWriter) -> None:
        self.store = store
        self.repo = repo
        self.studio = studio
        self.writer = writer

    @property
    def engine(self) -> CopyEngine:
        return self.studio.engine

    async def score(self, req: ContentScoreRequest) -> ContentScores:
        if not req.body.strip():
            raise DomainError("Write the body first, then score it.")
        if req.content_id:
            await self.repo.find_by_id(req.content_id)  # 404 if it was deleted
        voice = await self.studio.voice_text()
        has_social = bool(req.linkedin.strip() or req.x.strip())
        body_task = self.engine.score_article(req.title, req.body, voice, req.kind.value)
        if has_social:
            body, social = await asyncio.gather(body_task, self.engine.score_post(PostCopy(linkedin=req.linkedin, x=req.x), "", voice))
        else:
            body, social = await body_task, None
        doc = ContentScores(id=req.content_id or "", body=body, social=social, updated_at=utcnow())
        if req.content_id:
            await self.store.put(doc)
        log.info("content_scored", extra={"kind": req.kind.value, "total": body.total, "social": social.total if social else None})
        return doc

    async def get(self, content_id: str) -> ContentScores | None:
        doc = await self.store.get("content-score", content_id, ContentScores)
        if doc is None:
            return None
        try:
            c = await self.repo.find_by_id(content_id)
        except NotFound:
            return None
        return _mark(doc, c.title, c.body, c.social.linkedin, c.social.x)

    async def summaries(self) -> list[ContentScoreSummary]:
        # Only pieces DTC has scored have a doc, so this stays a handful of reads; they run concurrently.
        docs = await self.store.list("content-score", ContentScores, limit=1000)
        marked = await asyncio.gather(*(self.get(d.id) for d in docs))
        return [
            ContentScoreSummary(id=m.id, total=m.body.total, band=m.body.band, social_total=m.social.total if m.social else None, stale=m.body.stale)
            for m in marked
            if m is not None  # the piece was deleted; its score goes with it
        ]

    async def revise(self, content_id: str, req: ContentReviseRequest) -> ContentRevision:
        doc = await self.store.get("content-score", content_id, ContentScores)
        if doc is None:
            raise DomainError("Score the piece first, so there are suggestions to apply.")
        if doc.body.fingerprint != fingerprint(req.title, req.body):
            raise Conflict("The text has changed since it was scored. Rescore it, then apply the suggestions.")
        fixes = fix_list(doc.body, limit=8)
        if not fixes:
            raise DomainError("There's nothing left to fix in the body.")
        words = word_count(req.body)
        if words > MAX_REVISE_WORDS:
            raise DomainError(f"At {words:,} words this is too long to rewrite in one pass. Apply the suggestions by hand, section by section.")
        rule = f"Keep it about the same length as now, roughly {words} words."
        out = await self.writer.revise(req.title, req.body, fixes, [], "", await self.studio.voice_text(), rule)
        log.info("content_revised", extra={"kind": req.kind.value, "before": words, "after": word_count(out.body)})
        return ContentRevision(title=out.title or req.title, excerpt=out.excerpt, body=out.body, words_before=words, words_after=word_count(out.body))


def _mark(doc: ContentScores, title: str, body: str, linkedin: str, x: str) -> ContentScores:
    """Flag scores whose text has changed since they were taken (compared with the saved piece)."""
    b = doc.body.model_copy(update={"stale": doc.body.fingerprint != fingerprint(title, body)})
    s: CopyScore | None = doc.social.model_copy(update={"stale": doc.social.fingerprint != post_fingerprint(linkedin, x)}) if doc.social else None
    return doc.model_copy(update={"body": b, "social": s})
