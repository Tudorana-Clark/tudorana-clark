"""Results and experiments: the measures, the rank statistics and the verdict rules."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.config import Settings
from app.main import create_app
from app.models import ChannelResult, Experiment, Post, PostResults
from app.results import MIN_PER_GROUP, channel_summary, conversation_rate, experiment_summary, mann_whitney_p, ranks, spearman

KEY = "test-admin-key"
ADMIN = {"x-admin-key": KEY}
S = "/v1/admin/studio"


@pytest.fixture
def client() -> Iterator[TestClient]:
    settings = Settings(environment="test", storage_backend="memory", admin_api_key=SecretStr(KEY), openai_endpoint="", image_endpoint="", resend_api_key=SecretStr(""))
    with TestClient(create_app(settings)) as c:
        yield c


def post(i: int, impressions: int, comments: int, *, exp: str | None = None, arm: str = "", x: ChannelResult | None = None) -> Post:
    return Post(
        id=f"p{i}",
        seed="s",
        status="posted",
        results=PostResults(linkedin=ChannelResult(impressions=impressions, comments=comments, reactions=10), x=x),
        experiment_id=exp,
        arm=arm,
    )


# ---------- Measures ----------


def test_conversation_rate_counts_conversation_not_likes() -> None:
    p = Post(id="a", seed="s", results=PostResults(linkedin=ChannelResult(impressions=2000, reactions=500, comments=10, reposts=4, shares=3, saves=3)))
    assert conversation_rate(p, "linkedin") == 1.0  # 20 per 2,000 = 1 per 100; the 500 likes don't count
    assert conversation_rate(p, "x") is None
    zero = Post(id="b", seed="s", results=PostResults(linkedin=ChannelResult(impressions=0, comments=3)))
    assert conversation_rate(zero, "linkedin") is None  # no impressions recorded: excluded, not infinite


# ---------- Statistics ----------


def test_ranks_average_ties() -> None:
    assert ranks([10, 20, 20, 30]) == [1, 2.5, 2.5, 4]


def test_spearman() -> None:
    assert spearman([1, 2, 3, 4], [10, 20, 30, 40]) == 1.0
    assert spearman([1, 2, 3, 4], [40, 30, 20, 10]) == -1.0
    assert spearman([1, 2], [1, 2]) is None
    assert spearman([1, 1, 1], [1, 2, 3]) is None  # no variation in one variable


def test_mann_whitney_separates_clear_gaps_from_noise() -> None:
    low = [1.0, 1.1, 1.2, 0.9, 1.0, 1.3, 0.8, 1.1, 1.0, 1.2, 0.9, 1.1, 1.0, 1.2, 0.95]
    high = [x + 1.5 for x in low]
    clear, noise = mann_whitney_p(high, low), mann_whitney_p(low, list(reversed(low)))
    assert clear is not None and clear < 0.001
    assert noise is not None and noise > 0.5
    assert mann_whitney_p([1.0], [2.0]) is None
    assert mann_whitney_p([1.0, 1.0], [1.0, 1.0]) == 1.0


# ---------- Verdicts ----------

EXP = Experiment(id="e1", name="Hook length", variable="First line length", arms=["Short", "Long"])


def test_experiment_collects_until_every_arm_has_enough() -> None:
    posts = [post(i, 1000, 30, exp="e1", arm="Short") for i in range(MIN_PER_GROUP)] + [post(100 + i, 1000, 10, exp="e1", arm="Long") for i in range(4)]
    s = experiment_summary(EXP, posts, "linkedin")
    assert s.verdict == "collecting" and "Long has 4 of 15" in s.note
    assert [a.n for a in s.arms] == [MIN_PER_GROUP, 4]


def test_experiment_lead_and_no_difference() -> None:
    short = [post(i, 1000, 30 + i % 5, exp="e1", arm="Short") for i in range(MIN_PER_GROUP)]
    long_ = [post(100 + i, 1000, 10 + i % 5, exp="e1", arm="Long") for i in range(MIN_PER_GROUP)]
    lead = experiment_summary(EXP, short + long_, "linkedin")
    assert lead.verdict == "lead" and lead.leader == "Short" and lead.p_value is not None and lead.p_value < 0.05
    assert "run the comparison again" in lead.note
    same = [post(200 + i, 1000, 20 + i % 5, exp="e1", arm="Long") for i in range(MIN_PER_GROUP)]
    even = experiment_summary(EXP, [post(300 + i, 1000, 20 + i % 5, exp="e1", arm="Short") for i in range(MIN_PER_GROUP)] + same, "linkedin")
    assert even.verdict == "no_clear_difference"


def test_channel_summary_groups_and_correlation_threshold() -> None:
    posts = [post(i, 1000, i) for i in range(5)]
    s = channel_summary(posts, "linkedin")
    assert s.n == 5 and s.median_rate == 0.2 and s.median_reaction_rate == 1.0
    assert s.by_band[0].key == "unscored" and not s.by_band[0].enough
    assert s.score_rho is None  # unscored posts never feed the correlation


# ---------- API ----------


def test_results_flow(client: TestClient) -> None:
    empty = client.get(f"{S}/results", headers=ADMIN).json()
    assert empty["measured"] == 0 and empty["min_per_group"] == MIN_PER_GROUP and empty["experiments"] == []

    exp = client.post(f"{S}/experiments", json={"name": "Hook length", "variable": "First line", "hypothesis": "Short hooks win", "arms": ["Short", "Long"]}, headers=ADMIN)
    assert exp.status_code == 201, exp.text
    eid = exp.json()["id"]
    dup = client.post(f"{S}/experiments", json={"name": "X", "arms": ["A", "a"]}, headers=ADMIN)
    assert dup.status_code == 422 and "different name" in dup.json()["detail"]

    body = {
        "seed": "Data first",
        "linkedin": "Hook\n\nBody",
        "status": "posted",
        "experiment_id": eid,
        "arm": "Short",
        "results": {"linkedin": {"impressions": 1200, "reactions": 40, "comments": 9, "reposts": 3}, "inquiries": 1, "measured_at": "2026-11-19"},
    }
    saved = client.post(f"{S}/posts", json=body, headers=ADMIN)
    assert saved.status_code == 201, saved.text
    assert saved.json()["results"]["linkedin"]["comments"] == 9
    bad = client.post(f"{S}/posts", json={**body, "results": {"linkedin": {"impressions": -5}}}, headers=ADMIN)
    assert bad.status_code == 422
    client.post(f"{S}/posts", json={"seed": "Not measured", "status": "posted"}, headers=ADMIN)

    summary = client.get(f"{S}/results", headers=ADMIN).json()
    assert summary["measured"] == 1 and summary["posted_unmeasured"] == 1 and summary["inquiries"] == 1
    li = summary["channels"][0]
    assert li["channel"] == "linkedin" and li["n"] == 1 and li["median_rate"] == 1.0
    assert summary["experiments"][0]["verdict"] == "collecting"

    concluded = client.put(f"{S}/experiments/{eid}", json={"name": "Hook length", "arms": ["Short", "Long"], "status": "concluded", "conclusion": "Short wins."}, headers=ADMIN)
    assert concluded.json()["status"] == "concluded"
    assert client.delete(f"{S}/experiments/{eid}", headers=ADMIN).status_code == 204
    assert client.get(f"{S}/results", headers=ADMIN).json()["experiments"] == []
    assert client.get(f"{S}/results").status_code == 401
