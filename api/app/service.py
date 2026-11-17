"""Content workflow: create, update, publish. Routers stay thin; rules live here."""

from __future__ import annotations

import asyncio
import hashlib
import uuid

from . import indexnow
from .config import Settings
from .errors import Conflict
from .models import ContactIn, ContactMessage, Content, ContentIn, Kind, Status, Subscriber, utcnow
from .notify import Notifier
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


# Top-level paths owned by the web app; a writing slug (served at /<slug>) can't use them.
# Mirrors RESERVED_SLUGS in web/src/lib/content.ts.
RESERVED_SLUGS = frozenset(
    "writing research speaking about studio api md indexnow feed rss sitemap robots llms llms-full og opengraph-image "
    "twitter-image icon articles notes contact subscribe signin signup tag author ghost".split()
)


def public_path(kind: Kind, slug: str) -> str:
    """Writing (articles, notes) lives at the root, /<slug>; other kinds keep their section."""
    section = _SECTION[kind]
    return f"/{slug}" if section == "writing" else f"/{section}/{slug}"


def check_slug(kind: Kind, slug: str) -> None:
    if _SECTION[kind] == "writing" and slug in RESERVED_SLUGS:
        raise Conflict(f"The address /{slug} is reserved by the site. Choose a different web address.")


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
        check_slug(content.kind, content.slug)
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
        check_slug(updated.kind, updated.slug)
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
        urls = [f"{base}{public_path(content.kind, content.slug)}", f"{base}/", f"{base}/{_SECTION[content.kind]}", f"{base}/sitemap.xml"]
        task = asyncio.create_task(indexnow.ping(base, self.settings.indexnow_key, urls))
        _background.add(task)
        task.add_done_callback(_background.discard)


def subscriber_id(email: str) -> str:
    """Stable id so the same address can only subscribe once (idempotent)."""
    return hashlib.sha256(email.strip().lower().encode()).hexdigest()[:32]


async def subscribe(repo: Repository, notifier: Notifier, email: str, source: str) -> bool:
    sub = Subscriber(id=subscriber_id(email), email=email.strip().lower(), source=source)
    created = await repo.add_subscriber(sub)
    if created:  # only genuinely new sign-ups, never repeats
        notifier.new_subscriber(sub)
    return created


async def contact(repo: Repository, notifier: Notifier, data: ContactIn) -> None:
    msg = ContactMessage(**data.model_dump(), id=uuid.uuid4().hex)
    await repo.add_message(msg)  # stored first, so nothing is lost if email fails
    notifier.new_message(msg)
