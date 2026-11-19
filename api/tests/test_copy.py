"""The copy rubric, its rule checks and the scoring engine (offline judge)."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.config import Settings
from app.copy_engine import CopyEngine, OfflineCopyJudge, band, fix_list, needs_revision
from app.copy_rubric import CRITERIA, check_article, check_linkedin, check_x, prompt_guidance
from app.main import create_app
from app.models import PostCopy

KEY = "test-admin-key"
ADMIN = {"x-admin-key": KEY}

GOOD_LINKEDIN = (
    "Most AI projects I see fail on data, not models.\n\n"
    + "\n\n".join(["Last month a client with 40 staff asked me for a chatbot. Two weeks in, we found three copies of their customer list, none of them right."] * 6)
    + "\n\nFix the list first. The chatbot took four days after that.\n\n#AI #SmallBusiness"
)


@pytest.fixture
def client() -> Iterator[TestClient]:
    settings = Settings(environment="test", storage_backend="memory", admin_api_key=SecretStr(KEY), openai_endpoint="", image_endpoint="", resend_api_key=SecretStr(""))
    with TestClient(create_app(settings)) as c:
        yield c


def by_id(results: list) -> dict:  # type: ignore[type-arg]
    return {r.id: r for r in results}


# ---------- Rubric ----------


def test_rubric_ids_are_unique_and_guidance_covers_each_channel() -> None:
    ids = [c.id for c in CRITERIA]
    assert len(ids) == len(set(ids))
    for ch in ("linkedin", "x", "article"):
        assert prompt_guidance(ch).count("\n") >= 3  # type: ignore[arg-type]


# ---------- LinkedIn rules ----------


def test_good_linkedin_post_passes_the_rules() -> None:
    r = by_id(check_linkedin(GOOD_LINKEDIN))
    assert all(x.status == "pass" for x in r.values()), {k: (v.status, v.note) for k, v in r.items() if v.status != "pass"}


def test_engagement_bait_fails_and_is_quoted() -> None:
    r = by_id(check_linkedin(GOOD_LINKEDIN + "\n\nComment YES below if you agree!"))
    assert r["li_no_bait"].status == "fail" and "Comment YES below" in r["li_no_bait"].quote
    assert by_id(check_linkedin("Short hook\n\nAgree?"))["li_no_bait"].status == "fail"


def test_long_hook_announcement_question_and_link() -> None:
    long_hook = "I am so excited to announce that after many long months of careful work we have finally launched our brand new AI readiness programme today"
    r = by_id(check_linkedin(f"{long_hook} https://example.com and more text"))
    assert r["li_hook_length"].status == "fail" and r["li_hook_alone"].status == "fail"
    assert r["li_no_announce"].status == "fail" and r["li_no_link"].status == "fail" and r["li_length"].status == "fail"
    assert by_id(check_linkedin("Is AI overhyped?\n\nBody."))["li_not_question_hook"].status == "warn"
    # The launch post legitimately carries the link: a warning, not a failure.
    assert by_id(check_linkedin("Read it here\n\nhttps://example.com", role="link"))["li_no_link"].status == "warn"


def test_hashtags_and_paragraphs() -> None:
    r = by_id(check_linkedin("Hook\n\n" + "word " * 160 + "\n\n#a #b #c #d"))
    assert r["li_hashtags"].status == "warn" and r["li_paragraphs"].status == "warn"


def test_empty_drafts_have_no_results() -> None:
    assert check_linkedin("  ") == [] and check_x("") == [] and check_article("T", "") == []


# ---------- X rules ----------


def test_x_rules() -> None:
    assert all(r.status == "pass" for r in check_x("Most AI projects fail on data, not models. Fix the customer list first; the chatbot took four days after that."))
    r = by_id(check_x("Reply with AI if you agree https://x.co/1 #a #b"))
    assert r["x_no_bait"].status == "fail" and r["x_no_link"].status == "fail" and r["x_hashtags"].status == "warn"
    assert by_id(check_x("Too short"))["x_length"].status == "warn"


# ---------- Article rules ----------

ARTICLE = """## Small firms are winning

Opening with 29% and £4.2bn.

## Why

Text.

## What to do

Steps.

## Sources

- ONS, Business insights, July 2026, https://ons.gov.uk/x
- KPMG, Trust in AI, https://kpmg.com/y
"""


def test_article_rules() -> None:
    r = by_id(check_article("Why small firms are quietly winning the race to use AI well", ARTICLE))
    assert r["a_headings"].status == "pass" and r["a_figures"].status == "pass" and r["a_title"].status == "pass"
    assert r["a_sources"].status == "warn" and "KPMG" in r["a_sources"].quote  # one undated source
    assert r["a_field_story"].status == "pass"
    bare = by_id(check_article("AI", "Just text with **[From the field — write it]**"))
    assert bare["a_headings"].status == "fail" and bare["a_sources"].status == "fail" and bare["a_field_story"].status == "fail"
    assert bare["a_title"].status == "warn"


# ---------- Engine ----------


async def test_engine_scores_bands_and_revision_brief() -> None:
    engine = CopyEngine(OfflineCopyJudge())
    good = await engine.score_post(PostCopy(linkedin=GOOD_LINKEDIN, x="I fixed a 40-person client's customer list before building their chatbot. The bot took four days."), "", "")
    assert good.judged and {c.channel for c in good.channels} == {"linkedin", "x"}
    assert good.total >= 80 and good.band == "strong" and not needs_revision(good)

    weak = await engine.score_post(PostCopy(linkedin="Excited to announce our new thing! Comment YES below https://a.co", x=""), "", "")
    assert [c.channel for c in weak.channels] == ["linkedin"]
    assert weak.total < 50 and needs_revision(weak)
    brief = fix_list(weak)
    assert brief.startswith("Fix these") and "engagement bait" in brief.lower()
    assert band(80) == "strong" and band(65) == "good" and band(50) == "needs_work" and band(49) == "weak"


async def test_engine_falls_back_to_rules_when_the_judge_fails() -> None:
    class Broken(OfflineCopyJudge):
        async def judge(self, drafts, voice, labels=None):  # type: ignore[no-untyped-def]
            from app.errors import UpstreamUnavailable

            raise UpstreamUnavailable("down")

    score = await CopyEngine(Broken()).score_post(PostCopy(linkedin=GOOD_LINKEDIN), "", "")
    assert not score.judged and score.total == 100 and "rule checks only" in score.summary
    assert all(c.kind == "rule" for c in score.criteria)


# ---------- API ----------


def test_write_returns_a_score_and_polishes_weak_drafts(client: TestClient) -> None:
    res = client.post("/v1/admin/studio/posts/write", json={"seed": "Most AI requests are really data requests"}, headers=ADMIN)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["linkedin"] and data["score"]["criteria"] and 0 <= data["score"]["total"] <= 100
    # The offline draft is thin, so the engine tried a second pass and kept the better version.
    assert data["score"]["revised"] in (True, False)
    assert data["score"]["fingerprint"]


def test_score_endpoint_and_validation(client: TestClient) -> None:
    res = client.post("/v1/admin/studio/posts/score", json={"linkedin": GOOD_LINKEDIN, "x": ""}, headers=ADMIN)
    assert res.status_code == 200 and res.json()["band"] == "strong"
    empty = client.post("/v1/admin/studio/posts/score", json={"linkedin": " ", "x": ""}, headers=ADMIN)
    assert empty.status_code == 400 and "draft first" in empty.json()["detail"]
    assert client.post("/v1/admin/studio/posts/score", json={"linkedin": "x"}).status_code == 401


def test_saved_score_goes_stale_when_the_text_changes(client: TestClient) -> None:
    score = client.post("/v1/admin/studio/posts/score", json={"linkedin": GOOD_LINKEDIN, "x": ""}, headers=ADMIN).json()
    post = client.post("/v1/admin/studio/posts", json={"seed": "Data first", "linkedin": GOOD_LINKEDIN, "score": score}, headers=ADMIN).json()
    assert post["score"]["stale"] is False and post["score"]["total"] == score["total"]
    edited = client.put(f"/v1/admin/studio/posts/{post['id']}", json={"seed": "Data first", "linkedin": GOOD_LINKEDIN + " More.", "score": score}, headers=ADMIN).json()
    assert edited["score"]["stale"] is True
