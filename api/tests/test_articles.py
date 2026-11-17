from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.article_ai import FIELD_PLACEHOLDER, normalise_url
from app.articles import article_words, unmatched_numbers
from app.config import Settings
from app.main import create_app

KEY = "test-admin-key"
ADMIN = {"x-admin-key": KEY}
A = "/v1/admin/studio/articles"


@pytest.fixture
def client() -> Iterator[TestClient]:
    settings = Settings(environment="test", storage_backend="memory", admin_api_key=SecretStr(KEY), openai_endpoint="", image_endpoint="", resend_api_key=SecretStr(""))
    with TestClient(create_app(settings)) as c:
        yield c


def test_helpers() -> None:
    assert normalise_url("https://www.ONS.gov.uk/report/?utm_source=x#top") == normalise_url("https://ons.gov.uk/report")
    assert article_words("one two three\n\n## Sources\n\n- a b c d e") == 3
    body = "In 2026, **29%** of firms used AI and £1.2bn was spent; 35% of large firms too.\n\n1. Step one\n\n## Sources\n- 99% made up"
    assert unmatched_numbers(body, "ONS: 29 % of businesses used AI; spending reached £1.2 bn") == ["35%"]


def test_playbook_defaults_to_house_rules(client: TestClient) -> None:
    rules = client.get("/v1/admin/studio/playbook", headers=ADMIN).json()["rules"]
    assert "600 to 900 words" in rules and "From the field" in rules
    saved = client.put("/v1/admin/studio/playbook", json={"rules": "Short rules."}, headers=ADMIN).json()
    assert saved["rules"] == "Short rules."


def test_full_article_flow(client: TestClient) -> None:
    work = client.post(A, json={"insight": "Small firms can out-learn big ones with AI"}, headers=ADMIN).json()
    wid = work["id"]

    # Steps that need earlier steps fail clearly.
    assert client.post(f"{A}/{wid}/draft", headers=ADMIN).status_code == 400
    assert client.post(f"{A}/{wid}/check", headers=ADMIN).status_code == 400

    outlined = client.post(f"{A}/{wid}/outline", headers=ADMIN).json()
    assert outlined["headline"] and len(outlined["headline_options"]) == 3
    sections = {s["key"]: s for s in outlined["outline"]}
    assert sections["problem"]["research"] and not sections["field"]["research"]

    res = client.post(f"{A}/{wid}/research", json={"section": "problem"}, headers=ADMIN).json()
    assert res["added"] == 1 and res["work"]["sources"][0]["section"] == "problem"
    again = client.post(f"{A}/{wid}/research", json={"section": "problem"}, headers=ADMIN).json()
    assert again["added"] == 0  # same URL is not added twice
    assert client.post(f"{A}/{wid}/research", json={"section": "field"}, headers=ADMIN).status_code == 400  # nothing to search for

    # Without field notes, the draft carries a visible placeholder instead of an invented story.
    drafted = client.post(f"{A}/{wid}/draft", headers=ADMIN)
    assert drafted.status_code == 200, drafted.text
    body = drafted.json()["content"]["body"]
    assert FIELD_PLACEHOLDER in body and "ons.gov.uk" in body
    cid = drafted.json()["work"]["content_id"]
    assert drafted.json()["content"]["status"] == "draft"

    checked = client.post(f"{A}/{wid}/check", headers=ADMIN).json()["check"]
    assert checked["has_field_story"] is False and checked["within_length"] is False
    assert checked["unmatched_numbers"] == []  # the placeholder's "100 to 150 words" is not a claim

    # Redrafting with notes updates the same content item.
    work_now = client.get(f"{A}/{wid}", headers=ADMIN).json()
    upd = {k: work_now[k] for k in ("insight", "angle", "headline", "headline_options", "outline", "sources", "source_ref", "idea_id")}
    client.put(f"{A}/{wid}", json={**upd, "field_notes": "A client in Leeds cut quoting time by half."}, headers=ADMIN)
    redrafted = client.post(f"{A}/{wid}/draft", headers=ADMIN).json()
    assert redrafted["content"]["id"] == cid and "Leeds" in redrafted["content"]["body"]

    posts = client.post(f"{A}/{wid}/distribute", headers=ADMIN).json()
    assert [p["role"] for p in posts] == ["headline_stat", "contrarian", "tip", "question", "link"]
    link = next(p for p in posts if p["role"] == "link")
    assert "/" in link["linkedin"] and link["planned_for"] and link["source"]["content_id"] == cid
    assert len(client.get("/v1/admin/studio/posts", headers=ADMIN).json()) == 5

    # A live article can't be overwritten by a redraft.
    client.post(f"/v1/admin/content/{cid}/publish", headers=ADMIN)
    assert client.post(f"{A}/{wid}/draft", headers=ADMIN).status_code == 409
