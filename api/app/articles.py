"""Article workbench: turn an insight into a sourced, fact-checked long-form draft and its distribution posts."""

from __future__ import annotations

import asyncio
import logging
import re
import uuid
from datetime import UTC, timedelta

from .article_ai import DEFAULT_PLAYBOOK, EVIDENCE_PLACEHOLDER, FIELD_PLACEHOLDER, ArticleWriter, normalise_url
from .config import Settings
from .copy_engine import fix_list
from .errors import Conflict, DomainError, NotFound
from .library import LibraryService
from .models import (
    ArticleCheck,
    ArticleWork,
    ArticleWorkIn,
    Content,
    ContentIn,
    Kind,
    Playbook,
    PlaybookIn,
    Post,
    PostVisual,
    ResearchRequest,
    ResearchResult,
    Status,
    utcnow,
)
from .repository import Repository
from .service import ContentService, public_path
from .studio import StudioService, source_ref
from .studio_store import StudioStore
from .text import plain_text, word_count

log = logging.getLogger(__name__)

MAX_SOURCES = 40
MIN_WORDS, MAX_WORDS = 600, 900
# Launch-day link post, then the rest spread across the following fortnight.
SCHEDULE = {"link": 0, "headline_stat": 2, "contrarian": 5, "tip": 8, "question": 12}
_SOURCES_HEADING = re.compile(r"^#{1,3}\s*sources\b", re.I | re.M)


# Percentages, money and significant numbers (with separators, decimals or 3+ digits). Years and list numbers are ignored.
_FIGURE = re.compile(r"[£$€]\s?\d[\d,]*(?:\.\d+)?\s?(?:bn|m|k|billion|million|thousand)?|\d[\d,]*(?:\.\d+)?\s?%|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+\.\d+\b|\b\d{3,}\b", re.I)
_YEAR = re.compile(r"^(19|20)\d{2}$")


def _norm_figure(f: str) -> str:
    return re.sub(r"[\s,]", "", f.lower()).replace("billion", "bn").replace("million", "m").replace("thousand", "k")


def figures(text: str) -> list[str]:
    out = []
    for m in _FIGURE.finditer(text):
        f = m.group(0).strip()
        if not _YEAR.match(f):
            out.append(f)
    return out


def unmatched_numbers(body: str, sources_text: str) -> list[str]:
    """Figures the article states that no source contains: the deterministic backstop to the AI fact-check."""
    m = _SOURCES_HEADING.search(body)
    article = (body[: m.start()] if m else body).replace(FIELD_PLACEHOLDER, "").replace(EVIDENCE_PLACEHOLDER, "")
    known = {_norm_figure(f) for f in figures(sources_text)}
    seen: dict[str, str] = {}
    for f in figures(article):
        key = _norm_figure(f)
        if key not in known and key not in seen:
            seen[key] = f
    return list(seen.values())


def article_words(body: str) -> int:
    """Word count of the article itself, excluding the Sources list."""
    m = _SOURCES_HEADING.search(body)
    return word_count(body[: m.start()] if m else body)


class ArticleService:
    def __init__(
        self, store: StudioStore, repo: Repository, content: ContentService, studio: StudioService, writer: ArticleWriter, settings: Settings, library: LibraryService
    ) -> None:
        self.store = store
        self.repo = repo
        self.content = content
        self.studio = studio
        self.writer = writer
        self.settings = settings
        self.library = library

    # ----- Playbook -----

    async def playbook(self) -> Playbook:
        return await self.store.get("playbook", "playbook", Playbook) or Playbook(rules=DEFAULT_PLAYBOOK)

    async def save_playbook(self, data: PlaybookIn) -> Playbook:
        pb = Playbook(rules=data.rules, updated_at=utcnow())
        await self.store.put(pb)
        return pb

    # ----- Workbench CRUD -----

    async def list_all(self) -> list[ArticleWork]:
        return await self.store.list("article", ArticleWork, limit=200)

    async def get(self, work_id: str) -> ArticleWork:
        work = await self.store.get("article", work_id, ArticleWork)
        if work is None:
            raise NotFound("That article plan no longer exists.")
        return work

    async def create(self, data: ArticleWorkIn) -> ArticleWork:
        work = ArticleWork(**data.model_dump(), id=uuid.uuid4().hex)
        await self.store.put(work)
        return work

    async def update(self, work_id: str, data: ArticleWorkIn) -> ArticleWork:
        current = await self.get(work_id)
        work = current.model_copy(update={**data.model_dump(), "updated_at": utcnow()})
        return await self._save(work)

    async def delete(self, work_id: str) -> None:
        await self.store.delete("article", work_id)

    async def _save(self, work: ArticleWork) -> ArticleWork:
        validated = ArticleWork.model_validate(work.model_dump())
        await self.store.put(validated)
        return validated

    # ----- Steps -----

    async def outline(self, work_id: str) -> ArticleWork:
        work = await self.get(work_id)
        material = await self._material(work)
        out = await self.writer.outline(work.insight, work.angle, (await self.playbook()).rules, await self.studio.voice_text(), material)
        return await self._save(
            work.model_copy(
                update={
                    "headline_options": out.headlines,
                    "headline": work.headline or (out.headlines[0] if out.headlines else ""),
                    "angle": work.angle or out.angle,
                    "outline": out.sections,
                    "updated_at": utcnow(),
                }
            )
        )

    async def research(self, work_id: str, req: ResearchRequest) -> ResearchResult:
        work = await self.get(work_id)
        section = next((s for s in work.outline if s.key == req.section), None)
        query = req.query or (section.research if section else "")
        if not query:
            raise DomainError("Give the researcher a question, or pick a section that needs evidence.")
        if len(work.sources) >= MAX_SOURCES:
            raise DomainError(f"This plan already has {MAX_SOURCES} sources. Remove some you won’t use first.")
        found, skipped = await self.writer.research(query, work.angle or work.insight, section.purpose if section else query)
        known = {normalise_url(str(s.url)) for s in work.sources}
        added = []
        for src in found:
            key = normalise_url(str(src.url))
            if key in known:
                continue
            known.add(key)
            added.append(src.model_copy(update={"id": uuid.uuid4().hex[:12], "section": req.section}))
        if found:
            try:
                await self.library.save_research(found, work.id)
            except Exception:  # the library is a convenience; never fail the research step over it
                log.exception("library_save_research_failed")
        room = MAX_SOURCES - len(work.sources)
        saved = await self._save(work.model_copy(update={"sources": [*work.sources, *added[:room]], "updated_at": utcnow()}))
        return ResearchResult(work=saved, added=min(len(added), room), skipped=skipped)

    async def draft(self, work_id: str) -> tuple[ArticleWork, Content]:
        work = await self.get(work_id)
        if not work.outline:
            raise DomainError("Create the outline first, so the draft follows your structure.")
        existing = await self._content(work)
        if existing and existing.status == Status.published:
            raise Conflict("This article is live. Edit it in the content editor instead of redrafting it here.")
        sources = [s for s in work.sources if s.selected]
        brief = "\n".join(
            [
                f"Headline: {work.headline or work.insight[:120]}",
                f"Argument: {work.angle or work.insight}",
                f"Insight: {work.insight}",
                "Outline:",
                *[f"- {s.title} [{s.key}]: {s.purpose}" for s in work.outline],
            ]
        )
        out = await self.writer.draft(brief, (await self.playbook()).rules, await self.studio.voice_text(), sources, work.field_notes)
        title = work.headline or out.title
        if existing:
            data = ContentIn.model_validate({**existing.model_dump(include=set(ContentIn.model_fields)), "title": title, "body": out.body, "excerpt": out.excerpt})
            content = await self.content.update(existing.id, data)
        else:
            content = await self.content.create(ContentIn(kind=Kind.article, title=title, body=out.body, excerpt=out.excerpt, category="Artificial Intelligence"))
        saved = await self._save(work.model_copy(update={"content_id": content.id, "check": None, "updated_at": utcnow()}))
        return saved, content

    async def check(self, work_id: str) -> ArticleWork:
        work = await self.get(work_id)
        content = await self._content(work)
        if content is None:
            raise DomainError("Draft the article first, then check it.")
        words = article_words(content.body)
        voice = await self.studio.voice_text()
        # The fact-check and the copy score are independent reads of the same draft: run them together.
        out, copy_score = await asyncio.gather(
            self.writer.check(content.body, work.sources, (await self.playbook()).rules, voice),
            self.studio.engine.score_article(content.title, content.body, voice),
        )
        report = ArticleCheck(
            word_count=words,
            within_length=MIN_WORDS <= words <= MAX_WORDS,
            claims=out.claims,
            voice_issues=out.voice_issues,
            guardrail_issues=out.guardrail_issues,
            has_field_story=out.has_field_story,
            # Figures from the author's own field notes are experience, not unsourced claims.
            unmatched_numbers=unmatched_numbers(content.body, " ".join([work.field_notes, *(f"{x.title} {x.finding}" for x in work.sources if x.selected)])),
            verdict=out.verdict,
            copy_score=copy_score,
        )
        return await self._save(work.model_copy(update={"check": report, "updated_at": utcnow()}))

    async def polish(self, work_id: str) -> tuple[ArticleWork, Content]:
        """Apply the copy score's suggestions to the draft, under the same integrity rules as drafting."""
        work = await self.get(work_id)
        content = await self._content(work)
        if content is None:
            raise DomainError("Draft the article first.")
        if content.status == Status.published:
            raise Conflict("This article is live. Edit it in the content editor instead.")
        score = work.check.copy_score if work.check else None
        fixes = fix_list(score, limit=8) if score else ""
        if not fixes:
            raise DomainError("Run the check first. There are no suggestions to apply yet.")
        sources = [s for s in work.sources if s.selected]
        out = await self.writer.revise(content.title, content.body, fixes, sources, (await self.playbook()).rules, await self.studio.voice_text())
        title = work.headline or out.title
        data = ContentIn.model_validate({**content.model_dump(include=set(ContentIn.model_fields)), "title": title, "body": out.body, "excerpt": out.excerpt or content.excerpt})
        updated = await self.content.update(content.id, data)
        saved = await self._save(work.model_copy(update={"check": None, "updated_at": utcnow()}))
        log.info("article_polished", extra={"work": work.id, "before": score.total if score else None})
        return saved, updated

    async def distribute(self, work_id: str) -> tuple[ArticleWork, list[Post]]:
        work = await self.get(work_id)
        content = await self._content(work)
        if content is None:
            raise DomainError("Draft the article first, then plan its posts.")
        url = f"{self.settings.site_url.rstrip('/')}{public_path(content.kind, content.slug)}"
        drafted = await self.writer.distribute(content.title, content.body, url, await self.studio.voice_text())
        polished = await self.studio.polish_many(drafted, content.title, f"Title: {content.title}\n{plain_text(content.body)[:8000]}")
        posts_copy = [(role, copy, score) for (role, _), (copy, score) in zip(drafted, polished, strict=True)]
        launch = (content.published_at or utcnow()).astimezone(UTC).replace(hour=9, minute=0, second=0, microsecond=0)
        ref = source_ref(content)
        created: list[Post] = []
        for role, copy, score in posts_copy:
            post = Post(
                id=uuid.uuid4().hex,
                seed=f"{content.title} — {role.replace('_', ' ')}",
                source=ref,
                linkedin=copy.linkedin,
                x=copy.x,
                hook=copy.hook,
                visual=PostVisual.none if role == "link" else PostVisual.quote,
                role=role,
                planned_for=launch + timedelta(days=SCHEDULE.get(role, 0)),
                score=score,
            )
            await self.store.put(post)
            created.append(post)
        saved = await self._save(work.model_copy(update={"distributed": [*work.distributed, *(p.id for p in created)], "updated_at": utcnow()}))
        log.info("article_distributed", extra={"work": work.id, "posts": len(created)})
        return saved, created

    # ----- Helpers -----

    async def _content(self, work: ArticleWork) -> Content | None:
        if not work.content_id:
            return None
        try:
            return await self.repo.find_by_id(work.content_id)
        except NotFound:
            return None  # the draft was deleted in the editor; the next draft creates a new one

    async def _material(self, work: ArticleWork) -> str:
        if not work.source_ref:
            return ""
        try:
            c = await self.repo.find_by_id(work.source_ref.content_id)
        except NotFound:
            return ""
        return f"Title: {c.title}\n{plain_text(c.body or c.excerpt)}"
