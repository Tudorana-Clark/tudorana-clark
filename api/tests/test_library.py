from datetime import date

import httpx
import pytest

from app.library import LibraryService, source_id
from app.link_check import check_link, parse_published
from app.models import ArticleSource, ImportRequest, ImportSave, LinkStatus
from app.studio_ai import ExtractedSource, OfflineStudioWriter
from app.studio_store import MemoryStudioStore

TEXT = """Research notes.
1. ONS found 29% of UK businesses use AI (July 2026). https://www.ons.gov.uk/ai-report?utm_source=claude
2. DSIT survey: one-third use AI. [DSIT](https://www.gov.uk/dsit-survey)
"""


class FakeWriter(OfflineStudioWriter):
    async def extract_sources(self, text: str) -> list[ExtractedSource]:
        return [
            ExtractedSource(
                url="https://www.ons.gov.uk/ai-report",
                title="AI in UK business",
                publisher="ONS",
                published="July 2026",
                sponsor="",
                findings=["29% of UK businesses use AI"],
                themes=["AI Adoption"],
            ),
            ExtractedSource(
                url="https://gov.uk/dsit-survey/",
                title="AI adoption survey",
                publisher="DSIT",
                published="October 2026",
                sponsor="",
                findings=["One-third use AI"],
                themes=["AI Adoption", "UK Economy"],
            ),
            ExtractedSource(
                url="https://invented.example.com/report", title="Made up", publisher="Nobody", published="2026", sponsor="", findings=["99% of everything"], themes=[]
            ),
        ]


async def fake_checker(urls: list[str]) -> dict[str, LinkStatus]:
    return {u: ("broken" if "dsit" in u else "ok") for u in urls}


@pytest.fixture
def lib() -> LibraryService:
    return LibraryService(MemoryStudioStore(), FakeWriter(), fake_checker)


def test_parse_published() -> None:
    assert parse_published("July 2026") == date(2026, 7, 1)
    assert parse_published("17 Sept 2026") == date(2026, 9, 1)
    assert parse_published("2026-03-04") == date(2026, 3, 1)
    assert parse_published("published 2025") == date(2025, 1, 1)
    assert parse_published("") is None


async def test_import_keeps_only_links_in_the_text(lib: LibraryService) -> None:
    preview = await lib.preview_import(ImportRequest(text=TEXT))
    assert preview.dropped == 1  # the invented link never makes it in
    assert [c.source.publisher for c in preview.candidates] == ["ONS", "DSIT"]
    assert [c.link_status for c in preview.candidates] == ["ok", "broken"]
    assert all(c.existing_id is None for c in preview.candidates)

    saved = await lib.save_import(ImportSave(items=preview.candidates, label="Claude: SME AI"))
    assert (saved.created, saved.merged) == (2, 0)
    items = await lib.list_all()
    ons = next(s for s in items if s.publisher == "ONS")
    assert ons.published_on == date(2026, 7, 1) and ons.imported_from == "Claude: SME AI" and ons.link_status == "ok"

    # Importing the same research again merges instead of duplicating.
    again = await lib.preview_import(ImportRequest(text=TEXT))
    assert all(c.existing_id for c in again.candidates)
    assert (await lib.save_import(ImportSave(items=again.candidates))).merged == 2
    assert len(await lib.list_all()) == 2


async def test_import_needs_links(lib: LibraryService) -> None:
    with pytest.raises(Exception, match="No links found"):
        await lib.preview_import(ImportRequest(text="Lots of notes but no links at all in this text."))


async def test_research_findings_join_the_library(lib: LibraryService) -> None:
    src = ArticleSource.model_validate(
        {
            "id": "x",
            "title": "AI in UK business",
            "publisher": "ONS",
            "url": "https://ons.gov.uk/ai-report/",
            "published": "July 2026",
            "finding": "35% of firms with 10+ staff use AI",
        }
    )
    await lib.save_research([src], "work-1")
    await lib.save_research([src], "work-2")
    [stored] = await lib.list_all()
    assert stored.id == source_id("https://www.ons.gov.uk/ai-report") and stored.used_in == ["work-1", "work-2"]
    assert [f.text for f in stored.findings] == ["35% of firms with 10+ staff use AI"]


async def test_link_check_refuses_internal_addresses() -> None:
    def explode(_: httpx.Request) -> httpx.Response:
        raise AssertionError("must not connect to internal addresses")

    async with httpx.AsyncClient(transport=httpx.MockTransport(explode)) as client:
        assert await check_link(client, "http://127.0.0.1:8000/healthz") == "broken"
        assert await check_link(client, "http://169.254.169.254/metadata") == "broken"
        assert await check_link(client, "file:///etc/passwd") == "broken"


async def test_link_check_follows_public_redirects() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/old":
            return httpx.Response(301, headers={"location": "/new"})
        return httpx.Response(405) if req.method == "HEAD" else httpx.Response(200)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await check_link(client, "https://example.com/old") == "ok"
