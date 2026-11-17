"""Media uploads to Blob Storage. Files are validated by size and magic bytes, never by filename."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Protocol

from azure.core.exceptions import AzureError
from azure.identity.aio import DefaultAzureCredential
from azure.storage.blob import ContentSettings
from azure.storage.blob.aio import BlobServiceClient

from .errors import DomainError, UpstreamUnavailable

log = logging.getLogger(__name__)

# signature -> (content type, extension)
_SIGNATURES: list[tuple[bytes, int, str, str]] = [
    (b"\x89PNG\r\n\x1a\n", 0, "image/png", "png"),
    (b"\xff\xd8\xff", 0, "image/jpeg", "jpg"),
    (b"GIF8", 0, "image/gif", "gif"),
    (b"WEBP", 8, "image/webp", "webp"),
    (b"ftypavif", 4, "image/avif", "avif"),
    (b"%PDF-", 0, "application/pdf", "pdf"),
]


def sniff(data: bytes) -> tuple[str, str]:
    for sig, offset, ctype, ext in _SIGNATURES:
        if data[offset : offset + len(sig)] == sig:
            return ctype, ext
    raise DomainError("Upload a PNG, JPEG, GIF, WebP, AVIF image or a PDF.")


class MediaStore(Protocol):
    async def put(self, data: bytes, prefix: str = "") -> tuple[str, str]: ...
    async def close(self) -> None: ...


class BlobMediaStore:
    def __init__(self, account: str, container: str, base_url: str, credential: DefaultAzureCredential) -> None:
        self._service = BlobServiceClient(f"https://{account}.blob.core.windows.net", credential=credential)
        self._container = container
        self._base_url = base_url.rstrip("/")

    async def put(self, data: bytes, prefix: str = "") -> tuple[str, str]:
        ctype, ext = sniff(data)
        name = f"{prefix.strip('/') + '/' if prefix else ''}{datetime.now(UTC):%Y/%m}/{uuid.uuid4().hex}.{ext}"
        try:
            blob = self._service.get_blob_client(self._container, name)
            await blob.upload_blob(
                data,
                overwrite=False,
                content_settings=ContentSettings(content_type=ctype, cache_control="public, max-age=31536000, immutable"),
            )
        except AzureError as exc:
            log.exception("blob_upload_failed")
            raise UpstreamUnavailable("The upload didn’t go through. Please try again.") from exc
        return f"{self._base_url}/{name}", ctype

    async def close(self) -> None:
        await self._service.close()


class MemoryMediaStore:
    def __init__(self) -> None:
        self.files: dict[str, bytes] = {}

    async def put(self, data: bytes, prefix: str = "") -> tuple[str, str]:
        ctype, ext = sniff(data)
        name = f"{prefix.strip('/') + '/' if prefix else ''}{uuid.uuid4().hex}.{ext}"
        self.files[name] = data
        return f"https://media.example.test/{name}", ctype

    async def close(self) -> None:
        return None
