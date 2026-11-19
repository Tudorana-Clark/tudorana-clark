"""Dependency wiring: one set of long-lived clients per process, built in the lifespan."""

from __future__ import annotations

import hmac
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, Request

from .ai import SeoGenerator
from .articles import ArticleService
from .config import Settings
from .covers import CoverService
from .errors import DomainError, RateLimited
from .library import LibraryService
from .media import MediaStore
from .notify import Notifier
from .repository import Repository
from .results import ResultsService
from .service import ContentService
from .studio import StudioService


@dataclass
class Container:
    repo: Repository
    media: MediaStore
    ai: SeoGenerator
    content: ContentService
    notifier: Notifier
    covers: CoverService
    studio: StudioService
    results: ResultsService
    articles: ArticleService
    library: LibraryService


def get_container(request: Request) -> Container:
    container: Container = request.app.state.container
    return container


def get_app_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


ContainerDep = Annotated[Container, Depends(get_container)]
SettingsDep = Annotated[Settings, Depends(get_app_settings)]


class Unauthorized(DomainError):
    status = 401
    title = "Unauthorized"


def require_admin(settings: SettingsDep, x_admin_key: Annotated[str, Header()] = "") -> None:
    expected = settings.admin_api_key.get_secret_value()
    if not expected or not hmac.compare_digest(x_admin_key.encode(), expected.encode()):
        raise Unauthorized("Sign in to the studio to do that.")


class SlidingWindowLimiter:
    """Per-process limiter for public write endpoints. Good enough for a single small replica."""

    def __init__(self, limit: int, window_seconds: float) -> None:
        self.limit = limit
        self.window = window_seconds
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        q = self.hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.limit:
            raise RateLimited("You’ve sent a few of these already. Please wait a minute and try again.")
        q.append(now)
        if len(self.hits) > 10_000:  # bound memory under abuse
            self.hits.clear()


public_writes = SlidingWindowLimiter(limit=5, window_seconds=60)


def client_key(request: Request, x_client_ip: Annotated[str, Header()] = "") -> str:
    # The Next.js server forwards the visitor IP; fall back to the socket peer.
    return x_client_ip or (request.client.host if request.client else "unknown")
