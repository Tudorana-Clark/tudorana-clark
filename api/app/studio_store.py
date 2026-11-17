"""Storage for the content studio: voice profile, idea bank, short-form posts and small state docs.

One Cosmos container (`studio`, partition key /type) keeps these private working documents apart from
published content. Every document carries `id` and `type`.
"""

from __future__ import annotations

import logging
from typing import Any, Protocol, TypeVar

from azure.core.exceptions import AzureError, ResourceNotFoundError
from azure.cosmos.aio import ContainerProxy, CosmosClient
from azure.cosmos.exceptions import CosmosHttpResponseError
from azure.identity.aio import DefaultAzureCredential
from pydantic import BaseModel

from .errors import NotFound, UpstreamUnavailable

log = logging.getLogger(__name__)

M = TypeVar("M", bound=BaseModel)


class StudioStore(Protocol):
    async def get(self, type_: str, doc_id: str, model: type[M]) -> M | None: ...
    async def list(self, type_: str, model: type[M], limit: int = 200) -> list[M]: ...
    async def put(self, doc: BaseModel) -> None: ...
    async def delete(self, type_: str, doc_id: str) -> None: ...
    async def close(self) -> None: ...


def _dump(doc: BaseModel) -> dict[str, Any]:
    data = doc.model_dump(mode="json")
    if "id" not in data or "type" not in data:
        raise ValueError("studio documents need an id and a type")
    return data


def _sort_key(row: dict[str, Any]) -> str:
    return str(row.get("updated_at") or row.get("created_at") or "")


class MemoryStudioStore:
    def __init__(self) -> None:
        self.docs: dict[tuple[str, str], dict[str, Any]] = {}

    async def get(self, type_: str, doc_id: str, model: type[M]) -> M | None:
        row = self.docs.get((type_, doc_id))
        return model.model_validate(row) if row else None

    async def list(self, type_: str, model: type[M], limit: int = 200) -> list[M]:
        rows = sorted((r for (t, _), r in self.docs.items() if t == type_), key=_sort_key, reverse=True)
        return [model.model_validate(r) for r in rows[:limit]]

    async def put(self, doc: BaseModel) -> None:
        data = _dump(doc)
        self.docs[(data["type"], data["id"])] = data

    async def delete(self, type_: str, doc_id: str) -> None:
        if self.docs.pop((type_, doc_id), None) is None:
            raise NotFound("That item no longer exists.")

    async def close(self) -> None:
        return None


class CosmosStudioStore:
    def __init__(self, endpoint: str, database: str, credential: DefaultAzureCredential) -> None:
        self._client = CosmosClient(endpoint, credential=credential, connection_timeout=10)
        self._c: ContainerProxy = self._client.get_database_client(database).get_container_client("studio")

    @staticmethod
    def _wrap(exc: Exception) -> UpstreamUnavailable:
        log.exception("studio_store_failure", exc_info=exc)
        return UpstreamUnavailable("The studio store is temporarily unavailable. Please try again shortly.")

    async def get(self, type_: str, doc_id: str, model: type[M]) -> M | None:
        try:
            row = await self._c.read_item(doc_id, partition_key=type_)
        except ResourceNotFoundError:
            return None
        except (CosmosHttpResponseError, AzureError) as exc:
            raise self._wrap(exc) from exc
        return model.model_validate(row)

    async def list(self, type_: str, model: type[M], limit: int = 200) -> list[M]:
        sql = "SELECT * FROM c WHERE c.type = @type ORDER BY c._ts DESC OFFSET 0 LIMIT @limit"
        params: list[dict[str, Any]] = [{"name": "@type", "value": type_}, {"name": "@limit", "value": limit}]
        try:
            rows = [r async for r in self._c.query_items(sql, parameters=params, partition_key=type_)]
        except (CosmosHttpResponseError, AzureError) as exc:
            raise self._wrap(exc) from exc
        return [model.model_validate(r) for r in rows]

    async def put(self, doc: BaseModel) -> None:
        try:
            await self._c.upsert_item(_dump(doc))
        except (CosmosHttpResponseError, AzureError) as exc:
            raise self._wrap(exc) from exc

    async def delete(self, type_: str, doc_id: str) -> None:
        try:
            await self._c.delete_item(doc_id, partition_key=type_)
        except ResourceNotFoundError as exc:
            raise NotFound("That item no longer exists.") from exc
        except (CosmosHttpResponseError, AzureError) as exc:
            raise self._wrap(exc) from exc

    async def close(self) -> None:
        await self._client.close()
