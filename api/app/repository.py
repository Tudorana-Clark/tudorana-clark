"""Persistence. `Repository` is the contract; Cosmos is production, Memory is for tests/offline."""

from __future__ import annotations

import logging
from typing import Any, Protocol

from azure.core.exceptions import AzureError, ResourceNotFoundError
from azure.cosmos.aio import ContainerProxy, CosmosClient
from azure.cosmos.exceptions import CosmosHttpResponseError
from azure.identity.aio import DefaultAzureCredential

from .errors import Conflict, NotFound, UpstreamUnavailable
from .models import ContactMessage, Content, Kind, Status, Subscriber

log = logging.getLogger(__name__)

_SUMMARY_FIELDS = (
    "c.id, c.kind, c.slug, c.title, c.excerpt, c.category, c.tags, c.feature_image, c.featured, "
    "c.status, c.published_at, c.updated_at, c.reading_minutes, c.event, c.video"
)


class Repository(Protocol):
    async def list_content(self, *, kind: Kind | None, published_only: bool, limit: int) -> list[dict[str, Any]]: ...
    async def get_by_slug(self, slug: str) -> Content | None: ...
    async def get(self, kind: Kind, content_id: str) -> Content: ...
    async def find_by_id(self, content_id: str) -> Content: ...
    async def save(self, content: Content) -> Content: ...
    async def delete(self, kind: Kind, content_id: str) -> None: ...
    async def add_subscriber(self, sub: Subscriber) -> bool: ...
    async def list_subscribers(self) -> list[Subscriber]: ...
    async def add_message(self, msg: ContactMessage) -> None: ...
    async def list_messages(self) -> list[ContactMessage]: ...
    async def ping(self) -> None: ...
    async def close(self) -> None: ...


def _dump(model: Content | Subscriber | ContactMessage) -> dict[str, Any]:
    return model.model_dump(mode="json")


class MemoryRepository:
    def __init__(self) -> None:
        self.content: dict[str, Content] = {}
        self.subscribers: dict[str, Subscriber] = {}
        self.messages: list[ContactMessage] = []

    async def list_content(self, *, kind: Kind | None, published_only: bool, limit: int) -> list[dict[str, Any]]:
        items = [
            c
            for c in self.content.values()
            if (kind is None or c.kind == kind) and (not published_only or c.status == Status.published)
        ]
        items.sort(key=lambda c: (c.published_at or c.updated_at), reverse=True)
        return [_dump(c) for c in items[:limit]]

    async def get_by_slug(self, slug: str) -> Content | None:
        return next((c for c in self.content.values() if c.slug == slug), None)

    async def get(self, kind: Kind, content_id: str) -> Content:
        c = self.content.get(content_id)
        if c is None or c.kind != kind:
            raise NotFound("That content no longer exists.")
        return c

    async def find_by_id(self, content_id: str) -> Content:
        c = self.content.get(content_id)
        if c is None:
            raise NotFound("That content no longer exists.")
        return c

    async def save(self, content: Content) -> Content:
        clash = await self.get_by_slug(content.slug)
        if clash and clash.id != content.id:
            raise Conflict(f"The address /{content.slug} is already used by “{clash.title}”.")
        self.content[content.id] = content
        return content

    async def delete(self, kind: Kind, content_id: str) -> None:
        await self.get(kind, content_id)
        del self.content[content_id]

    async def add_subscriber(self, sub: Subscriber) -> bool:
        if sub.id in self.subscribers:
            return False
        self.subscribers[sub.id] = sub
        return True

    async def list_subscribers(self) -> list[Subscriber]:
        return sorted(self.subscribers.values(), key=lambda s: s.created_at, reverse=True)

    async def add_message(self, msg: ContactMessage) -> None:
        self.messages.append(msg)

    async def list_messages(self) -> list[ContactMessage]:
        return sorted(self.messages, key=lambda m: m.created_at, reverse=True)

    async def ping(self) -> None:
        return None

    async def close(self) -> None:
        return None


class CosmosRepository:
    def __init__(self, endpoint: str, database: str, credential: DefaultAzureCredential) -> None:
        self._client = CosmosClient(endpoint, credential=credential, connection_timeout=10)
        db = self._client.get_database_client(database)
        self._content: ContainerProxy = db.get_container_client("content")
        self._subs: ContainerProxy = db.get_container_client("subscribers")
        self._msgs: ContainerProxy = db.get_container_client("messages")

    @staticmethod
    def _wrap(exc: Exception) -> UpstreamUnavailable:
        log.exception("cosmos_failure", exc_info=exc)
        return UpstreamUnavailable("The content store is temporarily unavailable. Please try again shortly.")

    async def _query(self, container: ContainerProxy, sql: str, params: list[dict[str, Any]]) -> list[dict[str, Any]]:
        try:
            return [item async for item in container.query_items(sql, parameters=params)]
        except (CosmosHttpResponseError, AzureError) as exc:
            raise self._wrap(exc) from exc

    async def list_content(self, *, kind: Kind | None, published_only: bool, limit: int) -> list[dict[str, Any]]:
        where = ["1=1"]
        params: list[dict[str, Any]] = [{"name": "@limit", "value": limit}]
        if kind:
            where.append("c.kind = @kind")
            params.append({"name": "@kind", "value": kind.value})
        if published_only:
            where.append("c.status = 'published'")
        order = "c.published_at" if published_only else "c.updated_at"
        # Only constant fragments are interpolated; every value is a bound @parameter.
        sql = f"SELECT {_SUMMARY_FIELDS} FROM c WHERE {' AND '.join(where)} ORDER BY {order} DESC OFFSET 0 LIMIT @limit"  # noqa: S608
        return await self._query(self._content, sql, params)

    async def get_by_slug(self, slug: str) -> Content | None:
        rows = await self._query(self._content, "SELECT * FROM c WHERE c.slug = @slug", [{"name": "@slug", "value": slug}])
        return Content.model_validate(rows[0]) if rows else None

    async def get(self, kind: Kind, content_id: str) -> Content:
        try:
            item = await self._content.read_item(content_id, partition_key=kind.value)
        except ResourceNotFoundError as exc:
            raise NotFound("That content no longer exists.") from exc
        except (CosmosHttpResponseError, AzureError) as exc:
            raise self._wrap(exc) from exc
        return Content.model_validate(item)

    async def find_by_id(self, content_id: str) -> Content:
        rows = await self._query(self._content, "SELECT * FROM c WHERE c.id = @id", [{"name": "@id", "value": content_id}])
        if not rows:
            raise NotFound("That content no longer exists.")
        return Content.model_validate(rows[0])

    async def save(self, content: Content) -> Content:
        clash = await self.get_by_slug(content.slug)
        if clash and clash.id != content.id:
            raise Conflict(f"The address /{content.slug} is already used by “{clash.title}”.")
        try:
            await self._content.upsert_item(_dump(content))
        except CosmosHttpResponseError as exc:
            if exc.status_code == 409:
                raise Conflict(f"The address /{content.slug} is already in use.") from exc
            raise self._wrap(exc) from exc
        return content

    async def delete(self, kind: Kind, content_id: str) -> None:
        try:
            await self._content.delete_item(content_id, partition_key=kind.value)
        except ResourceNotFoundError as exc:
            raise NotFound("That content no longer exists.") from exc
        except (CosmosHttpResponseError, AzureError) as exc:
            raise self._wrap(exc) from exc

    async def add_subscriber(self, sub: Subscriber) -> bool:
        try:
            await self._subs.create_item(_dump(sub))
            return True
        except CosmosHttpResponseError as exc:
            if exc.status_code == 409:
                return False
            raise self._wrap(exc) from exc

    async def list_subscribers(self) -> list[Subscriber]:
        rows = await self._query(self._subs, "SELECT * FROM c ORDER BY c.created_at DESC", [])
        return [Subscriber.model_validate(r) for r in rows]

    async def add_message(self, msg: ContactMessage) -> None:
        try:
            await self._msgs.create_item(_dump(msg))
        except (CosmosHttpResponseError, AzureError) as exc:
            raise self._wrap(exc) from exc

    async def list_messages(self) -> list[ContactMessage]:
        rows = await self._query(self._msgs, "SELECT * FROM c ORDER BY c.created_at DESC", [])
        return [ContactMessage.model_validate(r) for r in rows]

    async def ping(self) -> None:
        try:
            await self._content.read()
        except (CosmosHttpResponseError, AzureError) as exc:
            raise self._wrap(exc) from exc

    async def close(self) -> None:
        await self._client.close()
