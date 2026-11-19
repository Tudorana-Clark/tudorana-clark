"""Tudorana Clark content API."""

from __future__ import annotations

import json
import logging
import sys
import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from azure.identity.aio import DefaultAzureCredential
from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .ai import AzureSeoGenerator, OfflineSeoGenerator, SeoGenerator
from .article_ai import ArticleWriter, AzureArticleWriter, OfflineArticleWriter
from .articles import ArticleService
from .claude_composer import ClaudeComposer
from .config import Settings, get_settings
from .copy_engine import AzureCopyJudge, CopyEngine, CopyJudge, OfflineCopyJudge
from .covers import CoverService, ImageClient, MaiImageClient, OfflineImageClient, UnconfiguredImageClient, load_references
from .deps import Container
from .errors import DomainError
from .library import LibraryService
from .media import BlobMediaStore, MediaStore, MemoryMediaStore
from .notify import Notifier, NullNotifier, ResendNotifier
from .repository import CosmosRepository, MemoryRepository, Repository
from .results import ResultsService
from .routers import admin, public, studio
from .service import ContentService
from .studio import StudioService
from .studio_ai import AzureStudioWriter, OfflineStudioWriter, StudioWriter
from .studio_store import CosmosStudioStore, MemoryStudioStore, StudioStore


class JsonFormatter(logging.Formatter):
    """One JSON object per line, which Log Analytics parses into columns."""

    _skip = set(logging.makeLogRecord({}).__dict__) | {"message", "asctime"}

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {"level": record.levelname, "logger": record.name, "msg": record.getMessage()}
        payload.update({k: v for k, v in record.__dict__.items() if k not in self._skip})
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    logging.basicConfig(level=level, handlers=[handler], force=True)
    logging.getLogger("azure").setLevel(logging.WARNING)


log = logging.getLogger("api")


def build_container(settings: Settings, credential: DefaultAzureCredential | None) -> Container:
    repo: Repository
    media: MediaStore
    ai: SeoGenerator
    if settings.storage_backend == "cosmos" and credential is not None:
        repo = CosmosRepository(settings.cosmos_endpoint, settings.cosmos_database, credential)
        media = BlobMediaStore(settings.storage_account, settings.media_container, settings.media_base_url, credential)
        store: StudioStore = CosmosStudioStore(settings.cosmos_endpoint, settings.cosmos_database, credential)
    else:
        repo, media, store = MemoryRepository(), MemoryMediaStore(), MemoryStudioStore()
    if settings.openai_endpoint and credential is not None:
        ai = AzureSeoGenerator(
            settings.openai_endpoint,
            settings.openai_deployment,
            settings.openai_api_version,
            settings.openai_timeout_seconds,
            credential,
            settings.site_name,
            settings.author_name,
        )
    else:
        ai = OfflineSeoGenerator()
    # One Claude client, shared by post writing, scoring and article drafting (the article writer closes it).
    composer = (
        ClaudeComposer(settings.claude_resource, settings.claude_deployment, settings.claude_effort, settings.claude_timeout_seconds, credential)
        if settings.claude_resource and credential is not None
        else None
    )
    writer: StudioWriter
    judge: CopyJudge
    if settings.openai_endpoint and credential is not None:
        writer = AzureStudioWriter(
            settings.openai_endpoint,
            settings.openai_deployment,
            settings.openai_api_version,
            settings.openai_timeout_seconds,
            credential,
            settings.site_name,
            settings.author_name,
            composer,
        )
        judge = AzureCopyJudge(settings.openai_endpoint, settings.openai_deployment, settings.openai_api_version, settings.openai_timeout_seconds, credential, composer)
    else:
        writer = OfflineStudioWriter()
        judge = OfflineCopyJudge()
    article_writer: ArticleWriter
    if settings.openai_endpoint and credential is not None:
        article_writer = AzureArticleWriter(
            settings.openai_endpoint,
            settings.article_deployment or settings.openai_deployment,
            settings.openai_api_version,
            settings.article_timeout_seconds,
            credential,
            settings.author_name,
            composer,
        )
    else:
        article_writer = OfflineArticleWriter()
    images: ImageClient
    if settings.image_endpoint and credential is not None:
        images = MaiImageClient(settings.image_endpoint, settings.image_deployment, settings.cover_width, settings.cover_height, settings.image_timeout_seconds, credential)
    elif settings.storage_backend == "memory":
        images = OfflineImageClient(settings.cover_width, settings.cover_height)
    else:
        # Real storage but no Foundry endpoint: fail clearly rather than upload placeholder art.
        images = UnconfiguredImageClient()
    covers = CoverService(images, ai, media, settings.cover_width, settings.cover_height, settings.cover_candidates, load_references())
    key = settings.resend_api_key.get_secret_value()
    notifier: Notifier = ResendNotifier(key, settings.notify_email, settings.notify_from, settings.site_url) if key else NullNotifier()
    content = ContentService(repo, settings)
    studio = StudioService(store, repo, writer, CopyEngine(judge))
    library = LibraryService(store, writer)
    return Container(
        repo=repo,
        media=media,
        ai=ai,
        content=content,
        notifier=notifier,
        covers=covers,
        studio=studio,
        results=ResultsService(store),
        articles=ArticleService(store, repo, content, studio, article_writer, settings, library),
        library=library,
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        needs_azure = settings.storage_backend == "cosmos" or bool(settings.openai_endpoint) or bool(settings.image_endpoint) or bool(settings.claude_resource)
        credential = DefaultAzureCredential(managed_identity_client_id=settings.azure_client_id or None) if needs_azure else None
        if settings.environment == "production" and not settings.admin_api_key.get_secret_value():
            raise RuntimeError("ADMIN_API_KEY must be set in production")
        app.state.settings = settings
        app.state.container = build_container(settings, credential)
        features = {
            "ai": bool(settings.openai_endpoint),
            "images": bool(settings.image_endpoint),
            "claude": bool(settings.claude_resource),
            "email": bool(settings.resend_api_key.get_secret_value()),
        }
        log.info("api_started", extra={"backend": settings.storage_backend, **features})
        try:
            yield
        finally:
            c: Container = app.state.container
            await c.repo.close()
            await c.media.close()
            await c.ai.close()
            await c.covers.images.close()
            await c.studio.writer.close()
            await c.studio.engine.close()
            await c.studio.store.close()
            await c.articles.writer.close()
            await c.notifier.close()
            if credential is not None:
                await credential.close()

    app = FastAPI(
        title="Tudorana Clark API",
        version="1.0.0",
        lifespan=lifespan,
        docs_url=None if settings.environment == "production" else "/docs",
        redoc_url=None,
        openapi_url=None if settings.environment == "production" else "/openapi.json",
    )

    @app.exception_handler(DomainError)
    async def domain_error(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse({"title": exc.title, "detail": exc.detail, "status": exc.status}, status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # A custom validator's error carries the exception object in `ctx`, which isn't JSON: leave it out.
        errors = [{k: v for k, v in e.items() if k not in ("ctx", "input")} for e in exc.errors()]
        first = errors[0] if errors else {}
        field = ".".join(str(p) for p in first.get("loc", [])[1:]) or "request"
        msg = str(first.get("msg", "invalid value")).removeprefix("Value error, ")
        return JSONResponse(
            {"title": "Check the form", "detail": f"{field}: {msg}", "status": 422, "errors": errors},
            status_code=422,
        )

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled_error", extra={"path": request.url.path})
        return JSONResponse({"title": "Something went wrong", "detail": "Something went wrong on our side. Please try again.", "status": 500}, status_code=500)

    @app.middleware("http")
    async def access_log(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        start = time.perf_counter()
        response = await call_next(request)
        response.headers["x-request-id"] = rid
        if request.url.path != "/healthz":
            log.info(
                "request",
                extra={"rid": rid, "method": request.method, "path": request.url.path, "status": response.status_code, "ms": round((time.perf_counter() - start) * 1000, 1)},
            )
        return response

    @app.get("/healthz", include_in_schema=False)
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/readyz", include_in_schema=False)
    async def readyz(request: Request) -> dict[str, str]:
        await request.app.state.container.repo.ping()
        return {"status": "ready"}

    app.include_router(public.router)
    app.include_router(admin.router)
    app.include_router(studio.router)
    return app


app = create_app()
