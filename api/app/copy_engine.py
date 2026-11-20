"""Scores copy against the rubric in copy_rubric.py and decides whether a draft needs another pass.

Rule checks run in code. The judged criteria go to Claude (low effort) when it's configured, otherwise to the
OpenAI deployment. If the judgement fails, the score falls back to rule checks only and says so, so a model
outage never blocks writing.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Literal, Protocol

from azure.identity.aio import DefaultAzureCredential, get_bearer_token_provider
from openai import APIError, APITimeoutError, AsyncAzureOpenAI
from pydantic import BaseModel, Field

from .claude_composer import ClaudeComposer
from .copy_rubric import BY_ID, CONFIDENCE_WEIGHT, Channel, Criterion, RuleResult, check_article, check_linkedin, check_x, criteria
from .errors import DomainError, UpstreamUnavailable
from .models import ChannelScore, CopyScore, CriterionScore, PostCopy, ScoreBand
from .persona import personalise

log = logging.getLogger(__name__)

# A post is rewritten automatically when it scores below this, or fails any high-confidence check.
REVISE_BELOW = 75
# LinkedIn carries more of the post total: it's the longer, primary piece.
CHANNEL_WEIGHT: dict[Channel, float] = {"linkedin": 0.6, "x": 0.4, "article": 1.0}

HookType = Literal["story", "position", "result", "statement", "question", "announcement", "list", "other"]


def band(score: int) -> ScoreBand:
    return "strong" if score >= 80 else "good" if score >= 65 else "needs_work" if score >= 50 else "weak"


def fingerprint(*parts: str) -> str:
    return hashlib.sha256("\x00".join(p.strip() for p in parts).encode()).hexdigest()[:32]


def _clip(s: str, n: int) -> str:
    s = s.strip()
    return s if len(s) <= n else s[: n - 1] + "…"


# ---------- The judge ----------


class _Judged(BaseModel):
    id: str = Field(description="The criterion id, exactly as listed.")
    score: int = Field(ge=0, le=4, description="0 = misses it entirely, 2 = partly, 4 = does it well.")
    quote: str = Field(description="The exact words from the draft this is about (under 25 words). Empty if the score is 4.")
    suggestion: str = Field(description="One concrete fix in under 30 words: say what to change and how. Never suggest inventing facts. Empty if the score is 4.")


class _Judgement(BaseModel):
    criteria: list[_Judged] = Field(description="One entry for every criterion listed, in the same order.")
    hook_type: HookType = Field(description="What the first line of the main draft does.")
    summary: str = Field(description="One sentence: the single change that would most improve this copy.")


class Judgement(BaseModel):
    scores: dict[str, tuple[int, str, str]]  # id -> (0-4, quote, suggestion)
    hook_type: str
    summary: str


class CopyJudge(Protocol):
    async def judge(self, drafts: dict[Channel, str], voice: str, labels: dict[Channel, str] | None = None) -> Judgement: ...
    async def close(self) -> None: ...


def _judge_prompt(drafts: dict[Channel, str], voice: str, labels: dict[Channel, str] | None = None) -> tuple[str, str, list[Criterion]]:
    items = [c for ch in drafts for c in criteria(ch, "judge")]
    rubric = "\n".join(f"- {c.id} [{c.channel}]: {c.label}. {c.guidance}" for c in items)
    system = (
        "You are a demanding editor scoring social and long-form copy against an evidence-based rubric. "
        "Score each criterion 0-4 on what is actually on the page, not on potential. Be strict: 4 is rare and means a professional editor would change nothing. "
        "Quote the exact words each judgement is about. Suggestions must be specific edits the author can make; "
        "never suggest adding facts, figures, clients or results that aren't already in the draft. If a point needs first-hand detail, say what kind of detail to add.\n\n"
        f"Rubric:\n{rubric}\n\nThe author's voice, for the 'sounds like you' criteria:\n{voice[:3000]}"
    )
    names = labels or {}
    user = "\n\n".join(f"### {names.get(ch, ch).upper()} DRAFT\n{text[:30000]}" for ch, text in drafts.items())
    return system, user, items


def _to_judgement(out: _Judgement, items: list[Criterion]) -> Judgement:
    wanted = {c.id for c in items}
    scores = {j.id: (max(0, min(4, j.score)), _clip(j.quote, 300), _clip(j.suggestion, 300)) for j in out.criteria if j.id in wanted}
    return Judgement(scores=scores, hook_type=out.hook_type, summary=_clip(out.summary, 300))


class AzureCopyJudge:
    def __init__(self, endpoint: str, deployment: str, api_version: str, timeout: float, credential: DefaultAzureCredential, composer: ClaudeComposer | None) -> None:
        self._composer = composer
        token = get_bearer_token_provider(credential, "https://cognitiveservices.azure.com/.default")
        self._client = AsyncAzureOpenAI(azure_endpoint=endpoint, api_version=api_version, azure_ad_token_provider=token, timeout=timeout, max_retries=1)
        self._deployment = deployment

    async def judge(self, drafts: dict[Channel, str], voice: str, labels: dict[Channel, str] | None = None) -> Judgement:
        system, user, items = _judge_prompt(drafts, voice, labels)
        if self._composer is not None:
            out = await self._composer.parse(system, user, _Judgement, "copy_judge", effort="low")
            return _to_judgement(out, items)
        try:
            completion = await self._client.chat.completions.parse(
                model=self._deployment,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                response_format=_Judgement,
                temperature=0,
            )
        except (APITimeoutError, APIError) as exc:
            log.warning("copy_judge_failed", extra={"error": type(exc).__name__})
            raise UpstreamUnavailable("The scorer is unavailable right now.") from exc
        parsed = completion.choices[0].message.parsed
        if parsed is None:
            raise UpstreamUnavailable("The scorer couldn't read this draft.")
        return _to_judgement(parsed, items)

    async def close(self) -> None:
        # The composer is shared with the article writer, which closes it.
        await self._client.close()


class OfflineCopyJudge:
    """Deterministic stand-in for tests and local runs: rewards figures and first-person detail."""

    async def judge(self, drafts: dict[Channel, str], voice: str, labels: dict[Channel, str] | None = None) -> Judgement:
        scores: dict[str, tuple[int, str, str]] = {}
        for ch, text in drafts.items():
            has_figure = any(t.isdigit() for t in text)
            first_person = any(w in f" {text.lower()} " for w in (" i ", " my ", " i've ", " we "))
            for c in criteria(ch, "judge"):
                score = 3
                if c.id in ("specific", "a_specific", "x_specific") and not has_figure:
                    score = 1
                if c.id in ("only_you", "a_only_you") and not first_person:
                    score = 1
                tip = "" if score >= 3 else "Add a concrete detail from your own experience." if "only_you" in c.id else "Add a specific figure, name or date from your material."
                scores[c.id] = (score, "", tip)
        first = next(iter(drafts.values()), "").strip().splitlines()
        hook = "question" if first and first[0].rstrip().endswith("?") else "statement"
        return Judgement(scores=scores, hook_type=hook, summary="Offline scorer: add first-hand detail and a specific figure.")

    async def close(self) -> None:
        return None


# ---------- Scoring ----------


def _criterion(c: Criterion, status: str, points: float, note: str, quote: str = "", suggestion: str = "") -> CriterionScore:
    return CriterionScore.model_validate(
        {
            "id": c.id,
            "channel": c.channel,
            "kind": c.kind,
            "label": c.label,
            "confidence": c.confidence,
            "weight": c.weight,
            "status": status,
            "points": points,
            "note": _clip(note, 400),
            "quote": _clip(quote, 400),
            "suggestion": _clip(suggestion, 400),
            "basis": _clip(c.basis, 400),
        }
    )


def _from_rule(r: RuleResult) -> CriterionScore:
    return _criterion(BY_ID[r.id], r.status, {"pass": 1.0, "warn": 0.5, "fail": 0.0}[r.status], r.note, r.quote, r.suggestion)


def _from_judge(c: Criterion, score: int, quote: str, suggestion: str) -> CriterionScore:
    status = "pass" if score >= 3 else "warn" if score == 2 else "fail"
    return _criterion(c, status, score / 4, f"{score} of 4.", quote, suggestion)


def _channel_score(items: list[CriterionScore]) -> int:
    total = sum(i.weight * CONFIDENCE_WEIGHT[i.confidence] for i in items)
    got = sum(i.weight * CONFIDENCE_WEIGHT[i.confidence] * i.points for i in items)
    return round(100 * got / total) if total else 0


def needs_revision(score: CopyScore) -> bool:
    return score.total < REVISE_BELOW or any(c.status == "fail" and c.confidence == "high" for c in score.criteria)


def fix_list(score: CopyScore, limit: int = 6) -> str:
    """The weakest points as a revision brief, most valuable first."""
    weak = [c for c in score.criteria if c.status != "pass" and c.suggestion]
    weak.sort(key=lambda c: (c.status != "fail", -c.weight * CONFIDENCE_WEIGHT[c.confidence]))
    lines = [f"- [{c.channel}] {c.label}: {c.suggestion}" + (f' (about: "{c.quote}")' if c.quote else "") for c in weak[:limit]]
    return "Fix these, keeping everything that already works and never inventing facts:\n" + "\n".join(lines) if lines else ""


class CopyEngine:
    def __init__(self, judge: CopyJudge, short: str = "") -> None:
        self.judge = judge
        self.short = short

    async def _assemble(self, drafts: dict[Channel, str], rules: dict[Channel, list[RuleResult]], voice: str, fp: str, labels: dict[Channel, str] | None = None) -> CopyScore:
        judged: Judgement | None = None
        try:
            judged = await self.judge.judge(drafts, voice, labels)
        except (UpstreamUnavailable, DomainError) as exc:
            log.warning("copy_judge_unavailable", extra={"error": str(exc)})

        channels: list[ChannelScore] = []
        all_items: list[CriterionScore] = []
        weighted = weight_sum = 0.0
        for ch in drafts:
            items = [_from_rule(r) for r in rules[ch]]
            if judged is not None:
                for c in criteria(ch, "judge"):
                    if c.id in judged.scores:
                        s, quote, tip = judged.scores[c.id]
                        items.append(_from_judge(c, s, quote, tip))
            score = _channel_score(items)
            channels.append(ChannelScore(channel=ch, score=score, band=band(score)))
            all_items.extend(items)
            weighted += CHANNEL_WEIGHT[ch] * score
            weight_sum += CHANNEL_WEIGHT[ch]
        total = round(weighted / weight_sum) if weight_sum else 0
        if self.short:
            p = self.short
            all_items = [i.model_copy(update={"note": personalise(i.note, p), "suggestion": personalise(i.suggestion, p), "basis": personalise(i.basis, p)}) for i in all_items]
            if judged is not None:
                judged = judged.model_copy(update={"summary": personalise(judged.summary, p)})
        return CopyScore(
            total=total,
            band=band(total),
            channels=channels,
            criteria=all_items,
            hook_type=judged.hook_type if judged else "",
            summary=judged.summary if judged else "The AI judgement was unavailable, so this score covers the rule checks only. Rescore in a moment.",
            judged=judged is not None,
            fingerprint=fp,
        )

    async def score_post(self, copy: PostCopy | dict[str, str], role: str, voice: str) -> CopyScore:
        linkedin = copy.linkedin if isinstance(copy, PostCopy) else copy.get("linkedin", "")
        x = copy.x if isinstance(copy, PostCopy) else copy.get("x", "")
        drafts: dict[Channel, str] = {}
        rules: dict[Channel, list[RuleResult]] = {}
        if linkedin.strip():
            drafts["linkedin"], rules["linkedin"] = linkedin, check_linkedin(linkedin, role)
        if x.strip():
            drafts["x"], rules["x"] = x, check_x(x, role, linkedin)
        if not drafts:
            raise DomainError("Write a LinkedIn or X draft first, then score it.")
        return await self._assemble(drafts, rules, voice, post_fingerprint(linkedin, x))

    async def score_article(self, title: str, body: str, voice: str, kind: str = "article") -> CopyScore:
        """Long-form copy: an article, research paper, note, talk or video page (checks adapt to the kind)."""
        if not body.strip():
            raise DomainError("Write the body first, then score it.")
        return await self._assemble({"article": f"# {title}\n\n{body}"}, {"article": check_article(title, body, kind)}, voice, fingerprint(title, body), {"article": kind})

    async def close(self) -> None:
        await self.judge.close()


def post_fingerprint(linkedin: str, x: str) -> str:
    return fingerprint(linkedin, x)
