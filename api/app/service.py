"""Content workflow: create, update, publish. Routers stay thin; rules live here."""

from __future__ import annotations

import asyncio
import hashlib
import uuid

from . import indexnow
from .config import Settings
from .models import ContactIn, ContactMessage, Content, ContentIn, Kind, Status, Subscriber, utcnow
from .repository import Repository
from .text import reading_minutes, slugify, word_count

_SECTION = {
    Kind.article: "writing",
    Kind.note: "writing",
    Kind.research: "research",
    Kind.talk: "speaking",
    Kind.video: "speaking",
}

# Background tasks are referenced so they are not garbage-collected mid-flight.
_background: set[asyncio.Task[None]] = set()


def public_path(kind: Kind, slug: str) -> str:
    return f"/{_SECTION[kind]}/{slug}"


def _derived(data: ContentIn) -> dict[str, int]:
    return {"reading_minutes": reading_minutes(data.body), "word_count": word_count(data.body)}


class ContentService:
    def __init__(self, repo: Repository, settings: Settings) -> None:
        self.repo = repo
        self.settings = settings

    async def create(self, data: ContentIn) -> Content:
        content = Content(
            **data.model_dump(exclude={"slug"}),
            id=uuid.uuid4().hex,
            slug=data.slug or slugify(data.title),
            **_derived(data),
        )
        return await self.repo.save(content)

    async def update(self, content_id: str, data: ContentIn) -> Content:
        current = await self.repo.find_by_id(content_id)
        if current.kind != data.kind:
            # Kind is the partition key; changing it means moving the document.
            await self.repo.delete(current.kind, current.id)
        updated = current.model_copy(
            update={
                **data.model_dump(exclude={"slug", "published_at"}),
                "published_at": data.published_at or current.published_at,
                "slug": data.slug or current.slug,
                "updated_at": utcnow(),
                **_derived(data),
            }
        )
        # Re-validate the merged document so nested dicts become models again.
        saved = await self.repo.save(Content.model_validate(updated.model_dump()))
        if saved.status == Status.published:
            self._notify(saved)
        return saved

    async def set_status(self, content_id: str, status: Status) -> Content:
        current = await self.repo.find_by_id(content_id)
        now = utcnow()
        changes: dict[str, object] = {"status": status, "updated_at": now}
        if status == Status.published and current.published_at is None:
            changes["published_at"] = now
        saved = await self.repo.save(current.model_copy(update=changes))
        if status == Status.published:
            self._notify(saved)
        return saved

    async def delete(self, content_id: str) -> None:
        current = await self.repo.find_by_id(content_id)
        await self.repo.delete(current.kind, current.id)

    def _notify(self, content: Content) -> None:
        base = self.settings.site_url.rstrip("/")
        urls = [f"{base}{public_path(content.kind, content.slug)}", f"{base}/", f"{base}/{_SECTION[content.kind]}"]
        task = asyncio.create_task(indexnow.ping(base, self.settings.indexnow_key, urls))
        _background.add(task)
        task.add_done_callback(_background.discard)


def subscriber_id(email: str) -> str:
    """Stable id so the same address can only subscribe once (idempotent)."""
    return hashlib.sha256(email.strip().lower().encode()).hexdigest()[:32]


async def subscribe(repo: Repository, email: str, source: str) -> bool:
    return await repo.add_subscriber(Subscriber(id=subscriber_id(email), email=email.strip().lower(), source=source))


async def contact(repo: Repository, data: ContactIn) -> None:
    await repo.add_message(ContactMessage(**data.model_dump(), id=uuid.uuid4().hex))
