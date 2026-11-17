from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.config import Settings
from app.main import create_app
from app.text import reading_minutes, slugify

KEY = "test-admin-key"
ADMIN = {"x-admin-key": KEY}
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


@pytest.fixture
def client() -> Iterator[TestClient]:
    settings = Settings(environment="test", storage_backend="memory", admin_api_key=SecretStr(KEY), openai_endpoint="")
    with TestClient(create_app(settings)) as c:
        yield c


def article(**over: object) -> dict[str, object]:
    base: dict[str, object] = {
        "kind": "article",
        "title": "Why small businesses can win the AI era",
        "body": "For decades, new technology favoured the biggest players. " * 60,
        "category": "Artificial Intelligence",
        "tags": ["AI", "ai", "Business"],
    }
    base.update(over)
    return base


def test_text_helpers() -> None:
    assert slugify("Why small businesses can win the AI era!") == "why-small-businesses-can-win-the-ai-era"
    assert reading_minutes("word " * 461) == 3


def test_admin_requires_key(client: TestClient) -> None:
    assert client.get("/v1/admin/content").status_code == 401
    assert client.get("/v1/admin/content", headers={"x-admin-key": "wrong"}).status_code == 401


def test_draft_is_hidden_until_published(client: TestClient) -> None:
    created = client.post("/v1/admin/content", json=article(), headers=ADMIN)
    assert created.status_code == 201, created.text
    doc = created.json()
    assert doc["slug"] == "why-small-businesses-can-win-the-ai-era"
    assert doc["tags"] == ["AI", "Business"]
    assert doc["reading_minutes"] >= 2
    assert doc["status"] == "draft"

    assert client.get(f"/v1/content/{doc['slug']}").status_code == 404
    assert client.get("/v1/content").json()["items"] == []

    published = client.post(f"/v1/admin/content/{doc['id']}/publish", headers=ADMIN).json()
    assert published["status"] == "published" and published["published_at"]

    public = client.get(f"/v1/content/{doc['slug']}")
    assert public.status_code == 200
    assert client.get("/v1/content?kind=article").json()["items"][0]["slug"] == doc["slug"]
    assert client.get("/v1/content?kind=research").json()["items"] == []

    # Re-publishing keeps the original publish date.
    again = client.post(f"/v1/admin/content/{doc['id']}/publish", headers=ADMIN).json()
    assert again["published_at"] == published["published_at"]


def test_slug_conflict_is_reported(client: TestClient) -> None:
    assert client.post("/v1/admin/content", json=article(), headers=ADMIN).status_code == 201
    dup = client.post("/v1/admin/content", json=article(), headers=ADMIN)
    assert dup.status_code == 409
    assert "already used" in dup.json()["detail"]


def test_update_and_change_kind(client: TestClient) -> None:
    doc = client.post("/v1/admin/content", json=article(), headers=ADMIN).json()
    res = client.put(f"/v1/admin/content/{doc['id']}", json=article(kind="note", title="Renamed"), headers=ADMIN)
    assert res.status_code == 200, res.text
    assert res.json()["kind"] == "note"
    assert res.json()["slug"] == doc["slug"]  # slug is stable unless explicitly changed


def test_validation_errors_are_readable(client: TestClient) -> None:
    res = client.post("/v1/admin/content", json={"kind": "article", "title": ""}, headers=ADMIN)
    assert res.status_code == 422
    assert res.json()["detail"].startswith("title")
    res = client.post("/v1/admin/content", json=article(slug="Bad Slug"), headers=ADMIN)
    assert res.status_code == 422


def test_ai_offline_fallback(client: TestClient) -> None:
    res = client.post("/v1/admin/ai/seo", json={"kind": "article", "title": "Hello world", "body": "Some body text here."}, headers=ADMIN)
    assert res.status_code == 200
    assert res.json()["slug"] == "hello-world"


def test_media_upload_validates_type(client: TestClient) -> None:
    ok = client.post("/v1/admin/media", files={"file": ("x.png", PNG, "image/png")}, headers=ADMIN)
    assert ok.status_code == 201 and ok.json()["content_type"] == "image/png"
    bad = client.post("/v1/admin/media", files={"file": ("x.png", b"<script>", "image/png")}, headers=ADMIN)
    assert bad.status_code == 400


def test_subscribe_is_idempotent_and_rate_limited(client: TestClient) -> None:
    first = client.post("/v1/subscribe", json={"email": "Reader@Example.com"}, headers={"x-client-ip": "1.1.1.1"})
    second = client.post("/v1/subscribe", json={"email": "reader@example.com"}, headers={"x-client-ip": "1.1.1.1"})
    assert first.json() == {"ok": True, "new": True}
    assert second.json() == {"ok": True, "new": False}
    assert client.post("/v1/subscribe", json={"email": "nope"}).status_code == 422
    for _ in range(3):
        client.post("/v1/subscribe", json={"email": "a@example.com"}, headers={"x-client-ip": "1.1.1.1"})
    assert client.post("/v1/subscribe", json={"email": "b@example.com"}, headers={"x-client-ip": "1.1.1.1"}).status_code == 429
    assert len(client.get("/v1/admin/subscribers", headers=ADMIN).json()) == 2


def test_contact(client: TestClient) -> None:
    body = {"name": "Ada", "email": "ada@example.com", "topic": "Speaking", "message": "Would you speak at our event?"}
    assert client.post("/v1/contact", json=body, headers={"x-client-ip": "2.2.2.2"}).status_code == 202
    assert client.get("/v1/admin/messages", headers=ADMIN).json()[0]["name"] == "Ada"
