"""What posts actually did, and whether anything is working: the testing loop from Hopkins' Scientific Advertising.

The numbers are the ones the author copies from LinkedIn's and X's own analytics. The headline measure is the
conversation rate: comments, reposts, shares and saves per 100 impressions. Both feeds rank on those far more
than on likes, so it's the fairest single number to compare posts by.

Statistics are kept deliberately modest:
  • medians, not means (engagement is heavy-tailed: one viral post would swamp an average);
  • a group needs MIN_PER_GROUP posts before it's compared;
  • an experiment only shows a "lead" when a rank test (Mann-Whitney U) says the gap is unlikely to be chance,
    and even then the advice is to run it again before relying on it.
"""

from __future__ import annotations

import math
import uuid
from collections.abc import Callable, Iterable
from statistics import median
from typing import Literal

from .errors import NotFound
from .models import (
    ArmStat,
    ChannelResult,
    ChannelSummary,
    Experiment,
    ExperimentIn,
    ExperimentSummary,
    GroupStat,
    Post,
    PostStatus,
    ResultsSummary,
    utcnow,
)
from .studio_store import StudioStore

Channel = Literal["linkedin", "x"]
MIN_PER_GROUP = 15
MIN_FOR_CORRELATION = 10
LEAD_P = 0.05
BAND_ORDER = ["strong", "good", "needs_work", "weak", "unscored"]
FORMAT_LABEL = {"quote": "Quote card", "image": "Illustration", "none": "Text only"}


# ---------- Measures ----------


def conversation(r: ChannelResult) -> int:
    return sum(v or 0 for v in (r.comments, r.reposts, r.shares, r.saves))


def rate(count: int | None, impressions: int | None) -> float | None:
    if impressions is None or impressions <= 0 or count is None:
        return None
    return 100 * count / impressions


def channel_result(p: Post, ch: Channel) -> ChannelResult | None:
    if p.results is None:
        return None
    r = p.results.linkedin if ch == "linkedin" else p.results.x
    return r if r is not None and (r.impressions or 0) > 0 else None


def conversation_rate(p: Post, ch: Channel) -> float | None:
    r = channel_result(p, ch)
    return rate(conversation(r), r.impressions) if r else None


def _median(xs: Iterable[float | int | None]) -> float | None:
    vals = [float(x) for x in xs if x is not None]
    return round(median(vals), 3) if vals else None


# ---------- Rank statistics (no SciPy needed for two small formulas) ----------


def ranks(xs: list[float]) -> list[float]:
    """Average ranks, 1-based, ties sharing the mean of their positions."""
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    out = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        for k in range(i, j + 1):
            out[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return out


def spearman(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) != len(ys) or len(xs) < 3:
        return None
    rx, ry = ranks(xs), ranks(ys)
    mx, my = sum(rx) / len(rx), sum(ry) / len(ry)
    cov = sum((a - mx) * (b - my) for a, b in zip(rx, ry, strict=True))
    vx = math.sqrt(sum((a - mx) ** 2 for a in rx))
    vy = math.sqrt(sum((b - my) ** 2 for b in ry))
    return round(cov / (vx * vy), 3) if vx and vy else None


def mann_whitney_p(a: list[float], b: list[float]) -> float | None:
    """Two-sided p-value for Mann-Whitney U, normal approximation with tie correction."""
    n1, n2 = len(a), len(b)
    if n1 < 2 or n2 < 2:
        return None
    combined = a + b
    r = ranks(combined)
    u1 = sum(r[:n1]) - n1 * (n1 + 1) / 2
    mu = n1 * n2 / 2
    n = n1 + n2
    counts: dict[float, int] = {}
    for x in combined:
        counts[x] = counts.get(x, 0) + 1
    ties = sum(t**3 - t for t in counts.values())
    var = n1 * n2 / 12 * ((n + 1) - ties / (n * (n - 1)))
    if var <= 0:
        return 1.0
    z = (abs(u1 - mu) - 0.5) / math.sqrt(var)  # continuity correction
    return round(max(0.0, min(1.0, math.erfc(max(z, 0) / math.sqrt(2)))), 4)


# ---------- Grouping ----------


def _group(posts: list[Post], ch: Channel, key: Callable[[Post], str], order: list[str] | None = None) -> list[GroupStat]:
    groups: dict[str, list[Post]] = {}
    for p in posts:
        groups.setdefault(key(p), []).append(p)
    keys = [k for k in (order or []) if k in groups] + sorted(k for k in groups if k not in (order or []))
    out = []
    for k in keys:
        g = groups[k]
        out.append(
            GroupStat(
                key=k,
                n=len(g),
                median_rate=_median(conversation_rate(p, ch) for p in g),
                median_impressions=_median(r.impressions for p in g if (r := channel_result(p, ch))),
                enough=len(g) >= MIN_PER_GROUP,
            )
        )
    return out


def channel_summary(posts: list[Post], ch: Channel) -> ChannelSummary:
    measured = [p for p in posts if channel_result(p, ch)]
    results = [r for p in measured if (r := channel_result(p, ch))]
    scored = [(p.score.total, conversation_rate(p, ch)) for p in measured if p.score is not None]
    pairs = [(float(s), r) for s, r in scored if r is not None]
    rho = spearman([s for s, _ in pairs], [r for _, r in pairs]) if len(pairs) >= MIN_FOR_CORRELATION else None
    return ChannelSummary(
        channel=ch,
        n=len(measured),
        median_rate=_median(conversation_rate(p, ch) for p in measured),
        median_reaction_rate=_median(rate(r.reactions, r.impressions) for r in results),
        median_impressions=_median(r.impressions for r in results),
        negatives=sum(r.negatives or 0 for r in results),
        by_band=_group(measured, ch, lambda p: p.score.band if p.score else "unscored", BAND_ORDER),
        by_hook=_group(measured, ch, lambda p: p.score.hook_type if p.score and p.score.hook_type else "unknown"),
        by_format=_group(measured, ch, lambda p: FORMAT_LABEL.get(p.visual.value, p.visual.value)),
        score_rho=rho,
        score_n=len(pairs),
    )


def experiment_summary(exp: Experiment, posts: list[Post], ch: Channel) -> ExperimentSummary:
    mine = [p for p in posts if p.experiment_id == exp.id and p.arm in exp.arms and channel_result(p, ch)]
    by_arm = {a: [p for p in mine if p.arm == a] for a in exp.arms}
    arms = [
        ArmStat(
            arm=a,
            n=len(ps),
            median_rate=_median(conversation_rate(p, ch) for p in ps),
            negatives=sum((r.negatives or 0) for p in ps if (r := channel_result(p, ch))),
        )
        for a, ps in by_arm.items()
    ]
    short = [a for a in arms if a.n < MIN_PER_GROUP]
    if short:
        need = ", ".join(f"{a.arm} has {a.n} of {MIN_PER_GROUP}" for a in short)
        return ExperimentSummary(
            experiment=exp, channel=ch, arms=arms, verdict="collecting", note=f"Still collecting: {need}. Compare medians once every arm has {MIN_PER_GROUP} posts."
        )
    ranked = sorted(arms, key=lambda a: a.median_rate or 0, reverse=True)
    best, second = ranked[0], ranked[1]
    p = mann_whitney_p(
        [v for x in by_arm[best.arm] if (v := conversation_rate(x, ch)) is not None],
        [v for x in by_arm[second.arm] if (v := conversation_rate(x, ch)) is not None],
    )
    if p is not None and p < LEAD_P and (best.median_rate or 0) > (second.median_rate or 0):
        note = (
            f"{best.arm} leads: median {best.median_rate:.2f} against {second.median_rate:.2f} per 100 impressions ({"p < 0.001" if p < 0.001 else f"p = {p:.3f}"}). "
            "Treat it as a lead, not a rule: run the comparison again on new topics before you rely on it."
        )
        if best.negatives > second.negatives * 1.5 and best.negatives >= 3:
            note += f" Watch the cost: {best.arm} also drew {best.negatives} negatives against {second.negatives}."
        return ExperimentSummary(experiment=exp, channel=ch, arms=arms, verdict="lead", leader=best.arm, p_value=p, note=note)
    return ExperimentSummary(
        experiment=exp,
        channel=ch,
        arms=arms,
        verdict="no_clear_difference",
        p_value=p,
        note="No clear difference yet. The gap is small enough to be chance; keep the cheaper or more natural option, or test something bolder.",
    )


# ---------- Service ----------


class ResultsService:
    def __init__(self, store: StudioStore) -> None:
        self.store = store

    async def experiments(self) -> list[Experiment]:
        return await self.store.list("experiment", Experiment, limit=200)

    async def get_experiment(self, exp_id: str) -> Experiment:
        exp = await self.store.get("experiment", exp_id, Experiment)
        if exp is None:
            raise NotFound("That experiment no longer exists.")
        return exp

    async def create_experiment(self, data: ExperimentIn) -> Experiment:
        exp = Experiment(**data.model_dump(), id=uuid.uuid4().hex)
        await self.store.put(exp)
        return exp

    async def update_experiment(self, exp_id: str, data: ExperimentIn) -> Experiment:
        current = await self.get_experiment(exp_id)
        exp = Experiment(**data.model_dump(), id=current.id, created_at=current.created_at, updated_at=utcnow())
        await self.store.put(exp)
        return exp

    async def delete_experiment(self, exp_id: str) -> None:
        # Posts keep their experiment id; with the experiment gone they simply stop being grouped.
        await self.store.delete("experiment", exp_id)

    async def summary(self) -> ResultsSummary:
        posts = await self.store.list("post", Post, limit=2000)
        experiments = await self.experiments()
        measured = [p for p in posts if p.results and (channel_result(p, "linkedin") or channel_result(p, "x"))]
        exp_summaries: list[ExperimentSummary] = []
        for exp in experiments:
            channels: list[Channel] = [ch for ch in ("linkedin", "x") if any(p.experiment_id == exp.id and channel_result(p, ch) for p in posts)] or ["linkedin"]
            exp_summaries.extend(experiment_summary(exp, posts, ch) for ch in channels)
        return ResultsSummary(
            measured=len(measured),
            posted_unmeasured=sum(1 for p in posts if p.status == PostStatus.posted and p not in measured),
            inquiries=sum(p.results.inquiries for p in posts if p.results),
            min_per_group=MIN_PER_GROUP,
            channels=[channel_summary(posts, "linkedin"), channel_summary(posts, "x")],
            experiments=exp_summaries,
        )
