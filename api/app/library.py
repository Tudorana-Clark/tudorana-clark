"""Sources library: a long-lived bank of evidence, fed by Claude research imports and article research.

Rules:
  • A source is stored once per link (its id is a hash of the normalised URL); new findings merge in.
  • On import, a source is kept only if its URL appears in the pasted text: no link, no source.
  • Links are checked from the server with the SSRF-safe checker in link_check.py.
"""

from __future__ import annotations

import hashlib
import logging
import re
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from .article_ai import normalise_url
from .errors import DomainError, NotFound
from .link_check import check_links, parse_published
from .models import (
    ArticleSource,
    ImportCandidate,
    ImportPreview,
    ImportRequest,
    ImportSave,
    ImportSaved,
    LibrarySource,
    LibrarySourceIn,
    LinkStatus,
    SourceFinding,
    utcnow,
)
from .studio_ai import StudioWriter
from .studio_store import StudioStore

log = logging.getLogger(__name__)

LinkChecker = Callable[[list[str]], Awaitable[dict[str, LinkStatus]]]
_URL_IN_TEXT = re.compile(r"https?://[^\s<>\"'`)\]]+")
MAX_LIBRARY = 2000
CHECK_BATCH = 25


def source_id(url: str) -> str:
    return hashlib.sha256(normalise_url(url).encode()).hexdigest()[:24]


def urls_in(text: str) -> set[str]:
    return {normalise_url(u.rstrip(".,;:")) for u in _URL_IN_TEXT.findall(text)}


def _merge_findings(current: list[SourceFinding], new: list[SourceFinding]) -> list[SourceFinding]:
    seen = {f.text.strip().lower() for f in current}
    merged = list(current)
    for f in new:
        if f.text.strip().lower() not in seen:
            seen.add(f.text.strip().lower())
            merged.append(f)
    return merged[:20]


class LibraryService:
    def __init__(self, store: StudioStore, writer: StudioWriter, checker: LinkChecker = check_links) -> None:
        self.store = store
        self.writer = writer
        self.checker = checker

    async def list_all(self) -> list[LibrarySource]:
        return await self.store.list("source", LibrarySource, limit=MAX_LIBRARY)

    async def get(self, sid: str) -> LibrarySource:
        src = await self.store.get("source", sid, LibrarySource)
        if src is None:
            raise NotFound("That source is no longer in the library.")
        return src

    async def update(self, sid: str, data: LibrarySourceIn) -> LibrarySource:
        current = await self.get(sid)
        if source_id(str(data.url)) != sid:
            raise DomainError("To change a source’s link, add it as a new source and delete this one.")
        updated = current.model_copy(update={**data.model_dump(), "published_on": parse_published(data.published), "updated_at": utcnow()})
        return await self._put(updated)

    async def delete(self, sid: str) -> None:
        await self.store.delete("source", sid)

    async def check(self, sid: str) -> LibrarySource:
        src = await self.get(sid)
        status = (await self.checker([str(src.url)])).get(str(src.url), "broken")
        return await self._put(src.model_copy(update={"link_status": status, "link_checked_at": utcnow()}))

    async def check_batch(self) -> list[LibrarySource]:
        """Check the links that were never checked or were checked longest ago."""
        items = sorted(await self.list_all(), key=lambda s: (s.link_checked_at is not None, s.link_checked_at or datetime.min.replace(tzinfo=UTC)))[:CHECK_BATCH]
        if not items:
            return []
        results = await self.checker([str(s.url) for s in items])
        now = utcnow()
        return [await self._put(s.model_copy(update={"link_status": results.get(str(s.url), "broken"), "link_checked_at": now})) for s in items]

    # ----- Claude import -----

    async def preview_import(self, req: ImportRequest) -> ImportPreview:
        allowed = urls_in(req.text)
        if not allowed:
            raise DomainError("No links found in that text. Paste research that includes its source links.")
        extracted = await self.writer.extract_sources(req.text)
        seen: set[str] = set()
        candidates: list[ImportCandidate] = []
        dropped = 0
        for x in extracted:
            key = normalise_url(x.url)
            if key not in allowed or key in seen:
                dropped += key not in allowed  # invented or altered link: never imported
                continue
            seen.add(key)
            try:
                src = LibrarySourceIn.model_validate(
                    {
                        "url": x.url,
                        "title": x.title or x.publisher,
                        "publisher": x.publisher or "Unknown publisher",
                        "published": x.published,
                        "sponsor": x.sponsor,
                        "findings": [{"text": f} for f in x.findings],
                        "themes": x.themes,
                    }
                )
            except ValueError:
                dropped += 1
                continue
            existing = await self.store.get("source", source_id(str(src.url)), LibrarySource)
            candidates.append(ImportCandidate(source=src, existing_id=existing.id if existing else None))
        statuses = await self.checker([str(c.source.url) for c in candidates]) if candidates else {}
        for c in candidates:
            c.link_status = statuses.get(str(c.source.url), "unchecked")
        log.info("library_import_preview", extra={"found": len(candidates), "dropped": dropped})
        return ImportPreview(candidates=candidates, dropped=dropped)

    async def save_import(self, req: ImportSave) -> ImportSaved:
        label = req.label or f"Imported {datetime.now(UTC):%-d %b %Y}"
        created = merged = 0
        for item in req.items:
            status = item.link_status if item.link_status != "unchecked" else None
            was_new = await self._upsert(item.source, label, status)
            created += was_new
            merged += not was_new
        return ImportSaved(created=created, merged=merged)

    # ----- From article research -----

    async def save_research(self, found: list[ArticleSource], work_id: str) -> None:
        """Every web-research finding joins the library, so evidence outlives the article it was found for."""
        for f in found:
            data = LibrarySourceIn(
                url=f.url, title=f.title, publisher=f.publisher, published=f.published, sponsor=f.sponsor, findings=[SourceFinding(text=f.finding)] if f.finding else []
            )
            await self._upsert(data, "Article research", None, used_in=work_id)

    # ----- Helpers -----

    async def _upsert(self, data: LibrarySourceIn, label: str, status: LinkStatus | None, used_in: str | None = None) -> bool:
        sid = source_id(str(data.url))
        existing = await self.store.get("source", sid, LibrarySource)
        now = utcnow()
        if existing:
            update: dict[str, object] = {
                "findings": _merge_findings(existing.findings, data.findings),
                "themes": list(dict.fromkeys([*existing.themes, *data.themes]))[:8],
                "published": existing.published or data.published,
                "sponsor": existing.sponsor or data.sponsor,
                "used_in": list(dict.fromkeys([*existing.used_in, *([used_in] if used_in else [])])),
                "updated_at": now,
            }
            if status:
                update |= {"link_status": status, "link_checked_at": now}
            merged = existing.model_copy(update=update)
            await self._put(merged.model_copy(update={"published_on": parse_published(merged.published)}))
            return False
        await self._put(
            LibrarySource(
                **data.model_dump(),
                id=sid,
                published_on=parse_published(data.published),
                link_status=status or "unchecked",
                link_checked_at=now if status else None,
                imported_from=label[:300],
                used_in=[used_in] if used_in else [],
            )
        )
        return True

    async def _put(self, src: LibrarySource) -> LibrarySource:
        validated = LibrarySource.model_validate(src.model_dump())
        await self.store.put(validated)
        return validated
