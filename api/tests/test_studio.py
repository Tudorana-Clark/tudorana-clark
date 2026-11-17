from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.config import Settings
from app.main import create_app

KEY = "test-admin-key"
ADMIN = {"x-admin-key": KEY}
BODY = "For decades new technology favoured the biggest players. AI is breaking that pattern for small firms. " * 20


@pytest.fixture
def client() -> Iterator[TestClient]:
    settings = Settings(environment="test", storage_backend="memory", admin_api_key=SecretStr(KEY), openai_endpoint="", image_endpoint="", resend_api_key=SecretStr(""))
    with TestClient(create_app(settings)) as c:
        yield c


def publish(client: TestClient, title: str, body: str = BODY, kind: str = "article") -> str:
    doc = client.post("/v1/admin/content", json={"kind": kind, "title": title, "body": body}, headers=ADMIN).json()
    client.post(f"/v1/admin/content/{doc['id']}/publish", headers=ADMIN)
    return str(doc["id"])


def test_studio_requires_admin(client: TestClient) -> None:
    assert client.get("/v1/admin/studio/posts").status_code == 401
    assert client.get("/v1/admin/studio/voice").status_code == 401


def test_cover_briefs(client: TestClient) -> None:
    res = client.post("/v1/admin/studio/cover-briefs", json={"kind": "article", "title": "We need AI", "body": BODY}, headers=ADMIN)
    assert res.status_code == 200, res.text
    briefs = res.json()["briefs"]
    assert len(briefs) == 4 and all(b["scene"] and b["label"] for b in briefs)
    short = client.post("/v1/admin/studio/cover-briefs", json={"kind": "article", "title": "We need AI", "body": "Too short."}, headers=ADMIN)
    assert short.status_code == 400 and "a sentence or two" in short.json()["detail"]
    post = client.post("/v1/admin/studio/cover-briefs", json={"kind": "note", "title": "We need AI", "body": "Most AI requests are really data requests."}, headers=ADMIN)
    assert post.status_code == 200


def test_voice_learn_and_save(client: TestClient) -> None:
    assert client.get("/v1/admin/studio/voice", headers=ADMIN).json()["guide"] == ""
    assert client.post("/v1/admin/studio/voice/learn", headers=ADMIN).status_code == 400  # nothing published yet
    publish(client, "Why small businesses can win")
    draft = client.post("/v1/admin/studio/voice/learn", headers=ADMIN).json()
    assert draft["learned_from"] == 1 and draft["guide"]
    saved = client.put("/v1/admin/studio/voice", json={"guide": "Write plainly."}, headers=ADMIN).json()
    assert saved["guide"] == "Write plainly." and saved["updated_at"]
    assert client.get("/v1/admin/studio/voice", headers=ADMIN).json()["guide"] == "Write plainly."


def test_mining_is_incremental(client: TestClient) -> None:
    for i in range(5):
        publish(client, f"Piece {i}")
    first = client.post("/v1/admin/studio/ideas/mine", headers=ADMIN).json()
    assert first == {"added": 4, "scanned": 4, "remaining": 1}
    second = client.post("/v1/admin/studio/ideas/mine", headers=ADMIN).json()
    assert second == {"added": 1, "scanned": 1, "remaining": 0}
    assert client.post("/v1/admin/studio/ideas/mine", headers=ADMIN).json()["scanned"] == 0  # nothing new
    ideas = client.get("/v1/admin/studio/ideas", headers=ADMIN).json()
    assert len(ideas) == 5 and ideas[0]["source"]["path"].startswith("/")


def test_post_lifecycle_marks_idea_used(client: TestClient) -> None:
    idea = client.post("/v1/admin/studio/ideas", json={"text": "Most AI requests are really data requests."}, headers=ADMIN).json()
    copy = client.post("/v1/admin/studio/posts/write", json={"seed": idea["text"]}, headers=ADMIN).json()
    assert copy["linkedin"] and copy["x"] and len(copy["x"]) <= 280 and copy["hook"]
    revised = client.post("/v1/admin/studio/posts/write", json={"seed": idea["text"], "current": copy, "instruction": "Shorter"}, headers=ADMIN).json()
    assert "Shorter" in revised["linkedin"]

    post = client.post("/v1/admin/studio/posts", json={"seed": idea["text"], "idea_id": idea["id"], **copy}, headers=ADMIN)
    assert post.status_code == 201, post.text
    pid = post.json()["id"]
    assert client.get("/v1/admin/studio/ideas", headers=ADMIN).json()[0]["used_by"] == pid

    done = client.put(f"/v1/admin/studio/posts/{pid}", json={"seed": idea["text"], **copy, "status": "posted"}, headers=ADMIN).json()
    assert done["status"] == "posted" and done["posted_at"]
    assert client.post("/v1/admin/studio/posts", json={"seed": "x", "x": "y" * 281}, headers=ADMIN).status_code == 422
    assert client.delete(f"/v1/admin/studio/posts/{pid}", headers=ADMIN).status_code == 204
    assert client.get(f"/v1/admin/studio/posts/{pid}", headers=ADMIN).status_code == 404


def test_write_from_source_piece(client: TestClient) -> None:
    cid = publish(client, "Iceberg")
    res = client.post("/v1/admin/studio/posts/write", json={"seed": "Most of AI is underwater", "source_id": cid}, headers=ADMIN)
    assert res.status_code == 200
    gone = client.post("/v1/admin/studio/posts/write", json={"seed": "x", "source_id": "missing"}, headers=ADMIN)
    assert gone.status_code == 200  # a deleted source falls back to the seed alone
