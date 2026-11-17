from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.config import Settings
from app.main import create_app
from app.models import ContactMessage, Subscriber
from app.notify import _layout
from app.text import reading_minutes, slugify

KEY = "test-admin-key"
ADMIN = {"x-admin-key": KEY}
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


class RecordingNotifier:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []

    def new_subscriber(self, sub: Subscriber) -> None:
        self.sent.append(("subscriber", sub.email))

    def new_message(self, msg: ContactMessage) -> None:
        self.sent.append(("contact", msg.email))

    async def close(self) -> None:
        return None


@pytest.fixture
def notifier() -> RecordingNotifier:
    return RecordingNotifier()


@pytest.fixture
def client(notifier: RecordingNotifier) -> Iterator[TestClient]:
    settings = Settings(environment="test", storage_backend="memory", admin_api_key=SecretStr(KEY), openai_endpoint="", image_endpoint="", resend_api_key=SecretStr(""))
    with TestClient(create_app(settings)) as c:
        c.app.state.container.notifier = notifier  # type: ignore[attr-defined]
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


def test_subscribe_is_idempotent_and_rate_limited(client: TestClient, notifier: RecordingNotifier) -> None:
    first = client.post("/v1/subscribe", json={"email": "Reader@Example.com"}, headers={"x-client-ip": "1.1.1.1"})
    second = client.post("/v1/subscribe", json={"email": "reader@example.com"}, headers={"x-client-ip": "1.1.1.1"})
    assert first.json() == {"ok": True, "new": True}
    assert second.json() == {"ok": True, "new": False}
    assert client.post("/v1/subscribe", json={"email": "nope"}).status_code == 422
    for _ in range(3):
        client.post("/v1/subscribe", json={"email": "a@example.com"}, headers={"x-client-ip": "1.1.1.1"})
    assert client.post("/v1/subscribe", json={"email": "b@example.com"}, headers={"x-client-ip": "1.1.1.1"}).status_code == 429
    assert len(client.get("/v1/admin/subscribers", headers=ADMIN).json()) == 2
    # One email per genuinely new subscriber, none for the repeat sign-up.
    assert notifier.sent == [("subscriber", "reader@example.com"), ("subscriber", "a@example.com")]


def test_contact(client: TestClient, notifier: RecordingNotifier) -> None:
    body = {"name": "Ada", "email": "ada@example.com", "topic": "Speaking", "message": "Would you speak at our event?"}
    assert client.post("/v1/contact", json=body, headers={"x-client-ip": "2.2.2.2"}).status_code == 202
    assert client.get("/v1/admin/messages", headers=ADMIN).json()[0]["name"] == "Ada"
    assert notifier.sent == [("contact", "ada@example.com")]


def test_email_body_is_escaped() -> None:
    out = _layout("New message", [("From", "<script>x</script>")], "<b>hi</b>")
    assert "<script>" not in out and "&lt;script&gt;" in out and "&lt;b&gt;hi&lt;/b&gt;" in out


def test_ai_covers_offline(client: TestClient) -> None:
    req = {"kind": "research", "title": "Agents that check their own work", "body": "Some body text here.", "category": "AI"}
    res = client.post("/v1/admin/ai/covers", json=req, headers=ADMIN)
    assert res.status_code == 200, res.text
    out = res.json()
    assert out["style_version"] and out["model"] == "offline"
    assert out["concept"] and out["alt"].startswith("AI-generated illustration:")
    assert len(out["candidates"]) == 3 and out["failed"] == 0
    first = out["candidates"][0]
    assert (first["width"], first["height"]) == (1600, 1000)
    assert "/covers/" in first["url"] and first["url"].endswith(".jpg")

    # A literal concept is rendered as-is, which is what makes re-renders repeatable.
    again = client.post("/v1/admin/ai/covers", json={**req, "concept": "a small boat overtaking a large ship", "literal": True}, headers=ADMIN).json()
    assert again["concept"] == "a small boat overtaking a large ship"
    # A free-form idea is passed to the art director to become a drawable scene.
    idea = client.post("/v1/admin/ai/covers", json={**req, "concept": "small firms beating big ones with AI"}, headers=ADMIN).json()
    assert "small firms beating big ones with ai" in idea["concept"] and idea["concept"] != "small firms beating big ones with AI"

    # The chosen cover round-trips with its provenance.
    cover = {"style_version": out["style_version"], "model": out["model"], "concept": out["concept"], "generated_at": "2026-11-17T10:00:00Z"}
    doc = client.post("/v1/admin/content", json=article(feature_image={"url": first["url"], "alt": out["alt"]}, cover=cover), headers=ADMIN)
    assert doc.status_code == 201, doc.text
    assert doc.json()["cover"]["concept"] == out["concept"]


def test_ai_covers_requires_admin_and_title(client: TestClient) -> None:
    assert client.post("/v1/admin/ai/covers", json={"kind": "article", "title": "x"}).status_code == 401
    assert client.post("/v1/admin/ai/covers", json={"kind": "article", "title": ""}, headers=ADMIN).status_code == 422


def test_cover_prompt_and_jpeg() -> None:
    from app.covers import PALETTES, build_prompt, to_jpeg
    from app.models import Kind

    assert set(PALETTES) == set(Kind)
    p = build_prompt(Kind.research, "a brass compass", with_references=True)
    assert "a brass compass" in p and "#14233C" in p and "reference images" in p and "No text" in p and "photorealism" in p
    assert "reference images" not in build_prompt(Kind.article, "x", with_references=False)

    from io import BytesIO

    from PIL import Image

    buf = BytesIO()
    Image.new("RGB", (1024, 1024), (10, 20, 30)).save(buf, "PNG")
    jpeg = to_jpeg(buf.getvalue(), 1600, 1000)
    assert jpeg[:3] == b"\xff\xd8\xff"
    assert Image.open(BytesIO(jpeg)).size == (1600, 1000)


def test_ai_covers_unconfigured_with_real_storage(monkeypatch: pytest.MonkeyPatch) -> None:
    from app import main

    monkeypatch.setattr(main, "CosmosRepository", lambda *a: main.MemoryRepository())
    monkeypatch.setattr(main, "BlobMediaStore", lambda *a: main.MemoryMediaStore())
    settings = Settings(environment="test", storage_backend="cosmos", admin_api_key=SecretStr(KEY), openai_endpoint="", image_endpoint="", resend_api_key=SecretStr(""))
    with TestClient(create_app(settings)) as c:
        res = c.post("/v1/admin/ai/covers", json={"kind": "article", "title": "Hello"}, headers=ADMIN)
    assert res.status_code == 503
    assert "Upload an image" in res.json()["detail"]


@pytest.mark.asyncio
async def test_mai_client_retries_and_maps_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    import base64

    import httpx
    from azure.core.credentials import AccessToken

    from app import covers
    from app.errors import DomainError

    class FakeCredential:
        async def get_token(self, *scopes: str, **kw: object) -> AccessToken:
            return AccessToken("t", 9_999_999_999)

    async def no_sleep(_: float) -> None:
        return None

    monkeypatch.setattr(covers.asyncio, "sleep", no_sleep)
    calls: list[str] = []
    ok = httpx.Response(200, json={"data": [{"b64_json": base64.b64encode(PNG).decode()}]})
    replies = [httpx.Response(429, headers={"retry-after": "1"}), ok, httpx.Response(400, text="blocked")]

    def handler(req: httpx.Request) -> httpx.Response:
        calls.append(f"{req.url.path} {req.headers['authorization']}")
        return replies.pop(0)

    client = covers.MaiImageClient("https://x.services.ai.azure.com", "MAI-Image-2.6-Flash", 1600, 1000, 5, FakeCredential())  # type: ignore[arg-type]
    client._http = httpx.AsyncClient(base_url="https://x.services.ai.azure.com", transport=httpx.MockTransport(handler))
    assert await client.render("p", []) == PNG
    assert calls == ["/mai/v1/images/generations Bearer t"] * 2
    with pytest.raises(DomainError, match="declined"):
        await client.render("p", [PNG])
    assert calls[-1].startswith("/mai/v1/images/edits")
    await client.close()
