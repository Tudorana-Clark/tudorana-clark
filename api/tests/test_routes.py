import pytest

from app.config import Settings
from app.errors import Conflict
from app.models import ContentIn, Kind
from app.repository import MemoryRepository
from app.service import ContentService, public_path


def test_writing_lives_at_root_and_others_keep_their_section() -> None:
    assert public_path(Kind.article, "why-small-businesses-can-win-the-ai-era") == "/why-small-businesses-can-win-the-ai-era"
    assert public_path(Kind.note, "a-note") == "/a-note"
    assert public_path(Kind.research, "paper") == "/research/paper"
    assert public_path(Kind.talk, "dtx-london-2025") == "/speaking/dtx-london-2025"
    assert public_path(Kind.video, "keynote") == "/speaking/keynote"


@pytest.fixture
def service() -> ContentService:
    return ContentService(MemoryRepository(), Settings(environment="test", storage_backend="memory"))


@pytest.mark.asyncio
async def test_writing_cannot_take_a_reserved_address(service: ContentService) -> None:
    with pytest.raises(Conflict, match="reserved"):
        await service.create(ContentIn(kind=Kind.article, title="About", slug="about"))
    # A research paper or talk lives under its section, so the same slug is fine there.
    created = await service.create(ContentIn(kind=Kind.research, title="About", slug="about"))
    assert created.slug == "about"


@pytest.mark.asyncio
async def test_renaming_writing_to_a_reserved_address_is_refused(service: ContentService) -> None:
    doc = await service.create(ContentIn(kind=Kind.article, title="Fine"))
    with pytest.raises(Conflict, match="reserved"):
        await service.update(doc.id, ContentIn(kind=Kind.article, title="Fine", slug="studio"))
