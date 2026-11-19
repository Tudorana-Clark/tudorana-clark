"""AI for long-form articles: outline, web research with citations, drafting, fact-checking and distribution.

Integrity rules enforced in code, not only in prompts:
  • Research findings are kept only when their URL is one the web search actually returned, so a
    source can never be invented by the model.
  • The draft may use figures only from the author's selected sources; the "From the field" section
    comes from the author's own notes or is left as a visible placeholder, never made up.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Literal, Protocol, TypeVar
from urllib.parse import urlsplit, urlunsplit

from azure.identity.aio import DefaultAzureCredential, get_bearer_token_provider
from openai import APIError, APITimeoutError, AsyncAzureOpenAI, AsyncOpenAI
from pydantic import BaseModel, Field

from .claude_composer import ClaudeComposer
from .copy_rubric import prompt_guidance
from .errors import UpstreamUnavailable
from .models import ArticleSource, ClaimCheck, OutlineSection, PostCopy
from .persona import persona_rule, personalise
from .studio_ai import clip
from .text import plain_text

log = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

FIELD_PLACEHOLDER = "**[From the field — write 100 to 150 words from your own client or Monster experience. The AI never writes this part.]**"
EVIDENCE_PLACEHOLDER = "**[Evidence needed — add 2 or 3 recent, named statistics here from your sources.]**"

DEFAULT_PLAYBOOK = """Purpose
Each article builds a public record of judgement: practical, evidence-led thinking on AI, technology, jobs and small business,
so readers, selectors and clients see someone who understands how things actually work.

Format
- Length: 600 to 900 words, readable in about four minutes.
- Home: tudoranaclark.com, with LinkedIn and X driving people to it.

Structure
1. Opening (2 or 3 short paragraphs): challenge a common assumption, then state the argument in one bold line.
2. The problem: what is going wrong, backed by 2 or 3 recent statistics in bold, then one sentence on the cause.
3. The insight: the core argument as 3 to 5 numbered points, each with a bold lead phrase and one or two sentences.
4. The evidence: a short table or set of data points, ideally with a UK angle.
5. From the field: 100 to 150 words from the author's own client or Monster experience, anonymised if needed.
6. What to do: 3 to 5 practical steps the reader can take.
7. Close: link back to "faster, cheaper, fairer" and end on one memorable bold line.
8. Sources: every source, with month and year.

Evidence rules
- Use only recent research, ideally from 2026 and as close to publication as possible.
- Name every source. Prefer the original report over news coverage of it.
- Label sponsored research honestly, e.g. "HBR Analytic Services, sponsored by Seismic".
- No invented or rounded-up figures. If a claim isn't sourced, it is the author's experience and should read that way.

Voice
- Confident, measured, human-first, British English.
- Lead with value: what changes for people and businesses.
- No hype, no doom, no jargon without an explanation.
- Keep politics implicit: enterprise, responsibility, and a state that enables rather than directs. No policy prescriptions and no party attacks.

Distribution
Each article becomes five short posts: the headline statistic, a contrarian line, a practical tip, a question to the audience, and a link post.
The link post goes out on launch day; the rest spread over the following two weeks.

Quality bar
- Could someone challenge any number? If so, fix it or cut it.
- Is there at least one thing only the author could have written?
- Would the author be comfortable with a selection panel reading it in five years?"""


def today_line() -> str:
    """Models don't know the date; without this they search for and cite last year's data."""
    now = datetime.now(UTC)
    return f"Today is {now:%-d %B %Y}. 'Recent' means published in {now.year} or late {now.year - 1}; never search for older years unless asked."


def normalise_url(url: str) -> str:
    """Compare URLs without query strings, fragments, case or trailing slashes (search adds utm tags)."""
    parts = urlsplit(url.strip())
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower().removeprefix("www."), parts.path.rstrip("/"), "", ""))


# ---------- Structured outputs ----------


class _Section(BaseModel):
    key: str = Field(description="Short lowercase slug, e.g. 'opening', 'problem', 'insight', 'evidence', 'field', 'steps', 'close'.")
    title: str = Field(description="Working heading for the section, 2-6 words.")
    purpose: str = Field(description="One or two sentences: what this section must do for this specific article.")
    research: str = Field(description="A precise web search query for the outside evidence this section needs, or empty if it needs none.")


class _Outline(BaseModel):
    headlines: list[str] = Field(description="Three headline options, each under 80 characters, plain and specific, no clickbait.")
    angle: str = Field(description="One sentence: the argument the article will make.")
    sections: list[_Section] = Field(description="The article sections in order, following the playbook structure (excluding the Sources list).")


class _Found(BaseModel):
    title: str = Field(description="Title of the report, page or article.")
    publisher: str = Field(description="The organisation that published it, e.g. 'Office for National Statistics'.")
    url: str = Field(description="The exact URL cited in the research notes.")
    published: str = Field(description="Month and year of publication, e.g. 'July 2026'. Empty if unknown.")
    sponsor: str = Field(description="Who sponsored or paid for the research, if stated. Empty otherwise.")
    finding: str = Field(description="The specific statistic or quotable finding, with figures exactly as the source states them.")


class _Findings(BaseModel):
    sources: list[_Found]


class _Draft(BaseModel):
    title: str = Field(description="The final headline.")
    excerpt: str = Field(description="1-2 sentences for listing cards, under 220 characters.")
    body: str = Field(description="The full article in Markdown, following the outline, ending with a '## Sources' list.")


class _Claim(BaseModel):
    claim: str
    status: Literal["sourced", "unsourced", "mismatch", "experience"]
    source_url: str
    note: str


class _Check(BaseModel):
    claims: list[_Claim] = Field(description="Every factual claim, figure or statistic in the article.")
    voice_issues: list[str] = Field(description="Specific places the writing breaks the voice rules (hype, doom, jargon, American spelling). Empty if none.")
    guardrail_issues: list[str] = Field(description="Policy prescriptions, party-political remarks or other guardrail breaches. Empty if none.")
    has_field_story: bool = Field(description="True only if the article contains a genuine first-hand story from the author, not a placeholder.")
    verdict: str = Field(description="One or two sentences: is it ready to publish, and what is the single most important fix?")


class _Post(BaseModel):
    role: Literal["headline_stat", "contrarian", "tip", "question", "link"]
    linkedin: str = Field(description="LinkedIn post, 150-250 words. A hook under 80 characters on its own line, short paragraphs, at most 3 hashtags on the last line.")
    x: str = Field(description="X post, 70-250 characters: the sharpest single version of the point.")
    hook: str = Field(description="At most 140 characters: one quotable line for a quote card.")


class _Posts(BaseModel):
    posts: list[_Post] = Field(description="Exactly five posts, one per role, in the order: headline_stat, contrarian, tip, question, link.")


# ---------- Protocol ----------


class Outline(BaseModel):
    headlines: list[str]
    angle: str
    sections: list[OutlineSection]


class DraftOut(BaseModel):
    title: str
    excerpt: str
    body: str


class CheckOut(BaseModel):
    claims: list[ClaimCheck]
    voice_issues: list[str]
    guardrail_issues: list[str]
    has_field_story: bool
    verdict: str


class ArticleWriter(Protocol):
    async def outline(self, insight: str, angle: str, playbook: str, voice: str, material: str) -> Outline: ...
    async def research(self, query: str, insight: str, purpose: str) -> tuple[list[ArticleSource], int]: ...
    async def draft(self, brief: str, playbook: str, voice: str, sources: list[ArticleSource], field_notes: str) -> DraftOut: ...
    async def check(self, body: str, sources: list[ArticleSource], playbook: str, voice: str) -> CheckOut: ...
    async def distribute(self, title: str, body: str, url: str, voice: str) -> list[tuple[str, PostCopy]]: ...
    async def revise(self, title: str, body: str, fixes: str, sources: list[ArticleSource], playbook: str, voice: str, length_rule: str = "") -> DraftOut: ...
    async def close(self) -> None: ...


def _slug(s: str) -> str:
    out = "".join(c if c.isalnum() else "-" for c in s.lower()).strip("-")
    while "--" in out:
        out = out.replace("--", "-")
    return out[:40] or "section"


def _sources_block(sources: list[ArticleSource]) -> str:
    lines = []
    for s in sources:
        sponsor = f", sponsored by {s.sponsor}" if s.sponsor else ""
        lines.append(f"- [{s.section or 'any'}] {s.publisher}{sponsor}, “{s.title}”, {s.published or 'date unknown'} — {s.url}\n  Finding: {s.finding}")
    return "\n".join(lines) or "(none selected)"


# ---------- Azure implementation ----------


class AzureArticleWriter:
    def __init__(
        self,
        endpoint: str,
        deployment: str,
        api_version: str,
        timeout: float,
        credential: DefaultAzureCredential,
        author: str,
        composer: ClaudeComposer | None = None,
        short: str = "",
    ) -> None:
        self._short = short
        # Drafting and fact-checking go to Claude when configured; outline, research and posts stay on the OpenAI deployment.
        self._composer = composer
        self._token = get_bearer_token_provider(credential, "https://cognitiveservices.azure.com/.default")
        self._client = AsyncAzureOpenAI(azure_endpoint=endpoint, api_version=api_version, azure_ad_token_provider=self._token, timeout=timeout, max_retries=2)
        self._v1_base = endpoint.rstrip("/") + "/openai/v1/"
        self._deployment = deployment
        self._timeout = timeout
        self._author = author

    def _system(self, system: str) -> str:
        return f"{system}\n\n{persona_rule(self._short, self._author)}" if self._short else system

    def _p(self, text: str) -> str:
        return personalise(text, self._short)

    async def _compose(self, system: str, user: str, schema: type[T], temperature: float, what: str) -> T:
        if self._composer is not None:
            return await self._composer.parse(self._system(system), user, schema, what)
        return await self._parse(system, user, schema, temperature, what)

    async def _parse(self, system: str, user: str, schema: type[T], temperature: float, what: str) -> T:
        try:
            completion = await self._client.chat.completions.parse(
                model=self._deployment,
                messages=[{"role": "system", "content": self._system(system)}, {"role": "user", "content": user}],
                response_format=schema,
                temperature=temperature,
            )
        except APITimeoutError as exc:
            log.warning("article_ai_timeout", extra={"what": what})
            raise UpstreamUnavailable("The AI assistant took too long to respond. Try again in a moment.") from exc
        except APIError as exc:
            log.exception("article_ai_failed", extra={"what": what})
            raise UpstreamUnavailable("The AI assistant is unavailable right now. Try again shortly.") from exc
        parsed = completion.choices[0].message.parsed
        if parsed is None:
            raise UpstreamUnavailable("The AI assistant couldn’t produce a result for this step. Try again.")
        return parsed

    async def outline(self, insight: str, angle: str, playbook: str, voice: str, material: str) -> Outline:
        system = (
            f"You are the editor planning a long-form article for {self._author}. Follow the playbook's structure exactly. "
            "Plan before anyone writes: headline options, the argument, and each section's job. "
            "For sections that need outside evidence (statistics, data, research), write a precise web search query aimed at recent primary sources, "
            "preferably UK and from the current year. Sections built on the author's own experience or opinion get an empty query."
            f"\n\n{today_line()}\n\nPlaybook:\n{playbook}\n\nAuthor's voice:\n{voice}"
        )
        user = f"Insight to develop:\n{insight}\n\nAngle (optional):\n{angle or '(none)'}"
        if material:
            user += f"\n\nThe author's own earlier material on this:\n{material[:6000]}"
        out = await self._parse(system, user, _Outline, 0.6, "outline")
        seen: set[str] = set()
        sections: list[OutlineSection] = []
        for s in out.sections[:12]:
            key = _slug(s.key or s.title)
            while key in seen:
                key = f"{key[:37]}-{len(seen)}"
            seen.add(key)
            sections.append(OutlineSection(key=key, title=clip(s.title, 120), purpose=clip(s.purpose, 600), research=clip(s.research, 300)))
        return Outline(headlines=[clip(self._p(h), 200) for h in out.headlines[:3]], angle=clip(self._p(out.angle), 600), sections=sections)

    async def research(self, query: str, insight: str, purpose: str) -> tuple[list[ArticleSource], int]:
        instructions = (
            "You are a research assistant for a careful, evidence-led writer. Use web search to find 2 to 4 recent sources that answer the query. "
            "Strongly prefer original reports and official statistics (ONS, government, regulators, academic, major research firms) over news coverage, "
            "and the most recent publication available, ideally from the current year. "
            "For each source give: the publisher, the title, the month and year of publication, any sponsor named in the report, "
            "and the exact figure or finding as the source states it. Cite every source with its URL. Do not round or restate numbers. "
            f"{today_line()}"
        )
        user = f"Query: {query}\n\nWhat the article argues: {insight}\nWhat this evidence is for: {purpose}"
        token = await self._token()
        client = AsyncOpenAI(base_url=self._v1_base, api_key=token, timeout=max(self._timeout, 90), max_retries=1)
        try:
            resp = await client.responses.create(model=self._deployment, tools=[{"type": "web_search"}], instructions=instructions, input=user)
        except APITimeoutError as exc:
            log.warning("research_timeout")
            raise UpstreamUnavailable("The web search took too long. Try again, or narrow the query.") from exc
        except APIError as exc:
            log.exception("research_failed")
            raise UpstreamUnavailable("Web research is unavailable right now. Try again shortly, or add a source by hand.") from exc
        finally:
            await client.close()

        cited = {
            normalise_url(a.url) for item in resp.output if item.type == "message" for part in item.content for a in getattr(part, "annotations", []) if getattr(a, "url", None)
        }
        notes = resp.output_text
        if not cited or not notes.strip():
            return [], 0
        structured = await self._parse(
            "Extract each cited source from these research notes. Copy URLs exactly. Copy figures exactly. Never add a source that is not in the notes.",
            notes,
            _Findings,
            0.0,
            "research_extract",
        )
        kept: list[ArticleSource] = []
        skipped = 0
        for f in structured.sources:
            if normalise_url(f.url) not in cited:
                skipped += 1  # the model produced a URL the search never returned: drop it
                continue
            try:
                kept.append(
                    ArticleSource.model_validate(
                        {
                            "id": "",
                            "title": clip(f.title, 300),
                            "publisher": clip(f.publisher, 300),
                            "url": f.url,
                            "published": clip(f.published, 40),
                            "sponsor": clip(f.sponsor, 300),
                            "finding": clip(f.finding, 800),
                        }
                    )
                )
            except ValueError:
                skipped += 1
        log.info("research_done", extra={"cited": len(cited), "kept": len(kept), "skipped": skipped})
        return kept, skipped

    async def draft(self, brief: str, playbook: str, voice: str, sources: list[ArticleSource], field_notes: str) -> DraftOut:
        field = (
            f"The author's own notes for 'From the field' (shape these into the section in their voice; keep every fact as given, add nothing):\n{field_notes}"
            if field_notes.strip()
            else f"The author has not written field notes yet. In the 'From the field' section output exactly this placeholder and nothing else:\n{FIELD_PLACEHOLDER}"
        )
        system = (
            f"You are {self._author}'s co-writer. Write the full article following the playbook and outline exactly, in the author's voice. "
            "Use statistics and quotes ONLY from the sources list, with figures exactly as given, and name the source in the text. "
            "NEVER create a number, percentage, breakdown or table value that is not in the sources list. If the sources don't hold enough data "
            "for a table, present the evidence as a short list of the sourced figures instead. "
            f"Where a section needs statistics and the sources list has none for it, put exactly this placeholder there: {EVIDENCE_PLACEHOLDER} "
            "Never write notes to the author or comments about the drafting process into the article. "
            "Aim for 700 to 850 words before the Sources list and never exceed 880. "
            "Label sponsored research as the playbook says. Any claim without a source must read as the author's own experience or view. "
            "Use Markdown: '## ' headings (short), bold for key lines and statistics, a numbered list for the insight, a small table for the evidence where the data allows. "
            "End with '## Sources' listing every source used as: Publisher (sponsor if any), Title, Month Year, URL."
            f"\n\nThe draft is scored against this evidence-based checklist; meet every point the facts allow:\n{prompt_guidance('article')}"
            f"\n\n{today_line()}\n\nPlaybook:\n{playbook}\n\nAuthor's voice:\n{voice}"
        )
        user = f"{brief}\n\nSources the author approved:\n{_sources_block(sources)}\n\n{field}"
        out = await self._compose(system, user, _Draft, 0.5, "draft")
        return DraftOut(title=clip(self._p(out.title), 200), excerpt=clip(self._p(out.excerpt), 400), body=self._p(out.body.strip())[:200_000])

    async def revise(self, title: str, body: str, fixes: str, sources: list[ArticleSource], playbook: str, voice: str, length_rule: str = "") -> DraftOut:
        system = (
            f"You are {self._author}'s editor. Revise the piece to address the fixes listed, and change nothing else. "
            "Integrity rules: never add a figure, statistic, quote, source, client, result or anecdote that is not already in the draft or the sources list. "
            "Keep every figure exactly as written. Keep the 'From the field' section's facts exactly as they are, and keep any placeholder in bold brackets untouched. "
            "Keep any Sources list, Markdown images, links and fenced code blocks (```...```) exactly as they are. "
            f"{length_rule or 'Stay within 700 to 880 words before the Sources list.'} "
            "If a fix needs facts you don't have, leave that point as it is."
            f"\n\nChecklist the piece is scored against:\n{prompt_guidance('article')}" + (f"\n\nPlaybook:\n{playbook}" if playbook else "") + f"\n\nAuthor's voice:\n{voice}"
        )
        user = f"Fixes:\n{fixes}\n\nSources the author approved:\n{_sources_block(sources)}\n\nCurrent title: {title}\n\nCurrent article:\n{body[:30000]}"
        out = await self._compose(system, user, _Draft, 0.3, "revise")
        return DraftOut(title=clip(self._p(out.title), 200), excerpt=clip(self._p(out.excerpt), 400), body=self._p(out.body.strip())[:200_000])

    async def check(self, body: str, sources: list[ArticleSource], playbook: str, voice: str) -> CheckOut:
        system = (
            "You are a strict fact-checker and editor. List every factual claim, figure and statistic in the article. "
            "For each: 'sourced' if a listed source states it with the same figure; 'mismatch' if a source is cited but the figure or wording differs; "
            "'unsourced' if it states a fact or number with no matching source; 'experience' if it is clearly framed as the author's own experience or opinion. "
            "Give the matching source URL when there is one, and a short note on what to fix. Also flag sources older than the current year as a voice issue. "
            "Then check the voice and political guardrails."
            f"\n\n{today_line()}\n\nPlaybook:\n{playbook}\n\nAuthor's voice:\n{voice}"
        )
        user = f"Sources available:\n{_sources_block(sources)}\n\nArticle:\n{body[:30000]}"
        out = await self._compose(system, user, _Check, 0.0, "check")
        return CheckOut(
            claims=[ClaimCheck(claim=clip(c.claim, 600), status=c.status, source_url=c.source_url[:500], note=clip(self._p(c.note), 400)) for c in out.claims[:60]],
            voice_issues=[clip(self._p(v), 300) for v in out.voice_issues[:20]],
            guardrail_issues=[clip(self._p(v), 300) for v in out.guardrail_issues[:20]],
            has_field_story=out.has_field_story and FIELD_PLACEHOLDER not in body,
            verdict=clip(self._p(out.verdict), 600),
        )

    async def distribute(self, title: str, body: str, url: str, voice: str) -> list[tuple[str, PostCopy]]:
        system = (
            f"You turn {self._author}'s article into five short posts, each standalone and in their voice: "
            "headline_stat (lead with the article's strongest sourced statistic and name the source), contrarian (the sharpest counter-intuitive line), "
            "tip (one practical step), question (a genuine question to the audience), link (introduces the article and ends with the URL). "
            "Only the link post contains the URL. Use figures exactly as written in the article.\n\n"
            f"Every post is scored against this evidence-based checklist (the link post is exempt from the no-link rule):\n"
            f"LinkedIn:\n{prompt_guidance('linkedin')}\n\nX:\n{prompt_guidance('x')}\n\nAuthor's voice:\n{voice}"
        )
        user = f"Title: {title}\nURL: {url}\n\n{body[:20000]}"
        out = await self._parse(system, user, _Posts, 0.7, "distribute")
        return [
            (p.role, PostCopy(linkedin=clip(self._p(p.linkedin), 3000), x=clip(self._p(p.x), 280), hook=clip(self._p(p.hook.strip().strip('"“”')), 220))) for p in out.posts[:5]
        ]

    async def close(self) -> None:
        await self._client.close()
        if self._composer is not None:
            await self._composer.close()


# ---------- Offline implementation (tests, local without Azure) ----------


class OfflineArticleWriter:
    async def outline(self, insight: str, angle: str, playbook: str, voice: str, material: str) -> Outline:
        names = [
            ("opening", "Opening", ""),
            ("problem", "The problem", f"2026 statistics on {insight[:80]}"),
            ("insight", "The insight", ""),
            ("evidence", "The evidence", "UK data 2026"),
            ("field", "From the field", ""),
            ("steps", "What to do", ""),
            ("close", "Close", ""),
        ]
        return Outline(
            headlines=[clip(insight, 80), "Option two", "Option three"],
            angle=clip(angle or insight, 600),
            sections=[OutlineSection(key=k, title=t, purpose=f"{t} for this piece.", research=q) for k, t, q in names],
        )

    async def research(self, query: str, insight: str, purpose: str) -> tuple[list[ArticleSource], int]:
        src = ArticleSource.model_validate(
            {
                "id": "",
                "title": f"Report on {query[:60]}",
                "publisher": "Office for National Statistics",
                "url": "https://www.ons.gov.uk/example",
                "published": "July 2026",
                "finding": "29% of UK businesses use at least one AI technology.",
            }
        )
        return [src], 0

    async def draft(self, brief: str, playbook: str, voice: str, sources: list[ArticleSource], field_notes: str) -> DraftOut:
        field = field_notes.strip() or FIELD_PLACEHOLDER
        refs = "\n".join(f"- {s.publisher}, {s.title}, {s.published}, {s.url}" for s in sources)
        body = f"## Opening\n\n{brief[:400]}\n\n## From the field\n\n{field}\n\n## Sources\n\n{refs}"
        return DraftOut(title=clip(brief.split("\n")[0], 200), excerpt=clip(brief, 200), body=body)

    async def check(self, body: str, sources: list[ArticleSource], playbook: str, voice: str) -> CheckOut:
        return CheckOut(claims=[], voice_issues=[], guardrail_issues=[], has_field_story=FIELD_PLACEHOLDER not in body, verdict="Offline check: review figures by hand.")

    async def revise(self, title: str, body: str, fixes: str, sources: list[ArticleSource], playbook: str, voice: str, length_rule: str = "") -> DraftOut:
        return DraftOut(title=title, excerpt=clip(plain_text(body), 200), body=body.replace("## Opening", "## The short answer", 1))

    async def distribute(self, title: str, body: str, url: str, voice: str) -> list[tuple[str, PostCopy]]:
        roles = ["headline_stat", "contrarian", "tip", "question", "link"]
        return [(r, PostCopy(linkedin=f"{title} ({r})" + (f"\n\n{url}" if r == "link" else ""), x=clip(f"{title} ({r})", 250), hook=clip(title, 140))) for r in roles]

    async def close(self) -> None:
        return None
