"""Scoring and fixing anything in Content: articles, research, notes, talks and videos."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.config import Settings
from app.copy_rubric import check_article
from app.main import create_app

KEY = "test-admin-key"
ADMIN = {"x-admin-key": KEY}
S = "/v1/admin/studio"
ARTICLE = """For decades new technology favoured the biggest players. In my work with 40 small firms, AI is breaking that pattern.

## Why small firms move faster

They have 29% less legacy data and decide in days.

## What changes

More text here.

## What to do

Steps.

## Sources

- ONS, Business insights, July 2026, https://ons.gov.uk/x
"""


@pytest.fixture
def client() -> Iterator[TestClient]:
    settings = Settings(environment="test", storage_backend="memory", admin_api_key=SecretStr(KEY), openai_endpoint="", image_endpoint="", resend_api_key=SecretStr(""))
    with TestClient(create_app(settings)) as c:
        yield c


def create(client: TestClient, kind: str, title: str, body: str, linkedin: str = "") -> str:
    doc = client.post("/v1/admin/content", json={"kind": kind, "title": title, "body": body, "social": {"linkedin": linkedin}}, headers=ADMIN)
    assert doc.status_code == 201, doc.text
    return str(doc.json()["id"])


def test_rules_fit_the_kind() -> None:
    short = "A quick thought about data. Fix the customer list before the chatbot."
    article = {r.id for r in check_article("AI", short, "article")}
    assert {"a_headings", "a_sources", "a_figures", "a_title"} <= article
    for kind in ("note", "talk", "video"):
        ids = {r.id for r in check_article("AI", short, kind)}
        assert ids == {"a_field_story"}, kind  # no demands for headings or a Sources list on short pages
    assert {r.id for r in check_article("AI", short, "research")} == article


def test_score_any_kind_and_keep_it(client: TestClient) -> None:
    cid = create(client, "note", "Data first", "Most AI requests are really data requests. I see it every week with clients.", linkedin="Data first.\n\nMore.")
    res = client.post(
        f"{S}/content-scores",
        json={
            "content_id": cid,
            "kind": "note",
            "title": "Data first",
            "body": "Most AI requests are really data requests. I see it every week with clients.",
            "linkedin": "Data first.\n\nMore.",
            "x": "",
        },
        headers=ADMIN,
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["body"]["criteria"] and data["social"]["channels"][0]["channel"] == "linkedin"
    assert not any(c["id"] == "a_headings" for c in data["body"]["criteria"])

    kept = client.get(f"{S}/content-scores/{cid}", headers=ADMIN).json()
    assert kept["body"]["total"] == data["body"]["total"] and kept["body"]["stale"] is False and kept["social"]["stale"] is False
    summary = client.get(f"{S}/content-scores", headers=ADMIN).json()
    assert summary == [{"id": cid, "total": data["body"]["total"], "band": data["body"]["band"], "social_total": data["social"]["total"], "stale": False}]

    # Editing the saved piece makes the stored score stale.
    client.put(f"/v1/admin/content/{cid}", json={"kind": "note", "title": "Data first", "body": "Changed body text for the note."}, headers=ADMIN)
    assert client.get(f"{S}/content-scores/{cid}", headers=ADMIN).json()["body"]["stale"] is True


def test_score_without_saving_and_validation(client: TestClient) -> None:
    res = client.post(f"{S}/content-scores", json={"kind": "talk", "title": "Keynote", "body": "A talk about AI for small firms."}, headers=ADMIN)
    assert res.status_code == 200 and res.json()["social"] is None
    assert client.get(f"{S}/content-scores", headers=ADMIN).json() == []
    empty = client.post(f"{S}/content-scores", json={"kind": "note", "title": "x", "body": "  "}, headers=ADMIN)
    assert empty.status_code == 400 and "body first" in empty.json()["detail"]
    gone = client.post(f"{S}/content-scores", json={"content_id": "missing", "kind": "note", "title": "x", "body": "text"}, headers=ADMIN)
    assert gone.status_code == 404
    assert client.get(f"{S}/content-scores/missing", headers=ADMIN).json() is None
    assert client.get(f"{S}/content-scores").status_code == 401


def test_revise_needs_a_fresh_score_and_returns_a_draft(client: TestClient) -> None:
    body = "## Opening\n\nShort piece with no detail."
    cid = create(client, "article", "AI", body)
    payload = {"kind": "article", "title": "AI", "body": body}
    first = client.post(f"{S}/content-scores/{cid}/revise", json=payload, headers=ADMIN)
    assert first.status_code == 400 and "Score the piece first" in first.json()["detail"]

    client.post(f"{S}/content-scores", json={"content_id": cid, **payload}, headers=ADMIN)
    stale = client.post(f"{S}/content-scores/{cid}/revise", json={**payload, "body": body + " edited"}, headers=ADMIN)
    assert stale.status_code == 409 and "Rescore" in stale.json()["detail"]

    ok = client.post(f"{S}/content-scores/{cid}/revise", json=payload, headers=ADMIN)
    assert ok.status_code == 200, ok.text
    rev = ok.json()
    assert rev["body"].startswith("## The short answer") and rev["words_before"] > 0
    # Nothing is saved: the piece is unchanged until DTC saves the revision from the editor.
    assert client.get(f"/v1/admin/content/{cid}", headers=ADMIN).json()["body"] == body


def test_revise_refuses_very_long_pieces(client: TestClient) -> None:
    body = "## A\n\n" + "word " * 4100
    cid = create(client, "research", "Long paper", body)
    client.post(f"{S}/content-scores", json={"content_id": cid, "kind": "research", "title": "Long paper", "body": body}, headers=ADMIN)
    res = client.post(f"{S}/content-scores/{cid}/revise", json={"kind": "research", "title": "Long paper", "body": body}, headers=ADMIN)
    assert res.status_code == 400 and "too long to rewrite" in res.json()["detail"]
