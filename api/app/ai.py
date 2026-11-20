"""AI SEO pack: one structured call to Azure OpenAI produces everything search and answer engines read."""

from __future__ import annotations

import logging
from typing import Protocol

from azure.identity.aio import DefaultAzureCredential, get_bearer_token_provider
from openai import APIError, APITimeoutError, AsyncAzureOpenAI
from pydantic import BaseModel, Field

from .copy_rubric import prompt_guidance
from .errors import UpstreamUnavailable
from .models import FaqItem, SeoPack, SeoRequest, SeoSuggestion, SocialCopy
from .persona import persona_rule, personalise, personalise_all
from .text import plain_text, slugify

log = logging.getLogger(__name__)

_MAX_INPUT_CHARS = 24_000  # ~6k tokens keeps each call well under a cent


class _Faq(BaseModel):
    question: str
    answer: str


class _Social(BaseModel):
    linkedin: str = Field(
        description=(
            "Written as the author's own first-person post. 150-400 words. A hook under 80 characters on its own line, short paragraphs, "
            "end with the takeaway or a genuine question, at most 3 hashtags on the last line. No link; it is added separately."
        )
    )
    x: str = Field(description="70-240 characters: the sharpest single version of the point. At most one hashtag. No link.")
    facebook: str = Field(description="2-3 sentences, conversational.")
    threads: str = Field(description="Max 400 characters, conversational.")
    bluesky: str = Field(description="Max 260 characters.")


class _SeoOut(BaseModel):
    meta_title: str = Field(description="50-60 characters, primary keyword first, no site name.")
    meta_description: str = Field(description="140-158 characters, states the answer, invites the click.")
    slug: str = Field(description="3-6 lowercase words joined by hyphens.")
    excerpt: str = Field(description="1-2 sentences for listing cards, under 220 characters.")
    tldr: str = Field(
        description="A 2-3 sentence direct answer an AI assistant could quote verbatim, in the third person, naming the person who wrote it by the short name in the instructions."
    )
    key_takeaways: list[str] = Field(description="3-5 standalone, factual, quotable statements.")
    faq: list[_Faq] = Field(description="3-5 questions real people would ask a search engine or chatbot, answered in 40-80 words each using only the article.")
    keywords: list[str] = Field(description="6-10 search phrases, most important first.")
    entities: list[str] = Field(description="Named people, organisations, technologies and concepts discussed.")
    tags: list[str] = Field(description="2-5 short topical tags in Title Case.")
    image_alt_hint: str = Field(description="Suggested alt text for a feature image that would suit this piece.")
    social: _Social


_SYSTEM = (
    "You are the editor for {site}, the personal publication of {author}. "
    "You optimise content for classic search (Google, Bing) and for AI answer engines (ChatGPT, Copilot, Perplexity, Gemini, Claude). "
    "Rules: British English. Never invent facts, statistics, quotes or claims that are not in the source. "
    "Prefer concrete, specific language over hype. No emoji. No clickbait. {persona}"
)


_CONCEPT_SYSTEM = (
    "You are the art director for {site}. Turn the piece below into ONE visual metaphor for a flat, hand-drawn editorial illustration. "
    "If the author gives a direction, it is the idea to express: keep its meaning, but make it something that can be drawn. "
    "Describe a concrete scene in 10-25 words using at most two or three elements: the objects or simple figures and what they are doing. "
    "Minimal beats busy: no backgrounds full of detail, no crowds. "
    "Prefer clever, specific metaphors that make the argument visible (contrast of scale, balance, growth, paths, tools, light). "
    "Simple faceless figures and hands are allowed. Never include text, letters, numbers, logos, screens or interfaces. "
    "Avoid clichés: robots, glowing brains, circuit boards, binary code, handshakes, lightbulbs, chess pieces, rockets, puzzle pieces. "
    "Reply with the scene only, no quotes and no full stop."
)


class SeoGenerator(Protocol):
    async def generate(self, req: SeoRequest) -> SeoSuggestion: ...
    async def concept(self, req: SeoRequest, direction: str = "") -> str: ...
    async def close(self) -> None: ...


def _clip(s: str, n: int) -> str:
    s = s.strip()
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def to_suggestion(out: _SeoOut, short: str = "") -> SeoSuggestion:
    """Clamp model output to our validated limits so a verbose model can never break a save, and name the author."""
    out = _named(out, short) if short else out
    return SeoSuggestion(
        seo=SeoPack(
            meta_title=_clip(out.meta_title, 70),
            meta_description=_clip(out.meta_description, 170),
            keywords=[_clip(k, 300) for k in out.keywords[:15]],
            tldr=_clip(out.tldr, 600),
            key_takeaways=[_clip(k, 300) for k in out.key_takeaways[:7]],
            faq=[FaqItem(question=_clip(f.question, 300), answer=_clip(f.answer, 1200)) for f in out.faq[:8]],
            entities=[_clip(e, 300) for e in out.entities[:15]],
        ),
        social=SocialCopy(
            linkedin=_clip(out.social.linkedin, 3000),
            x=_clip(out.social.x, 280),
            facebook=_clip(out.social.facebook, 2000),
            threads=_clip(out.social.threads, 500),
            bluesky=_clip(out.social.bluesky, 300),
        ),
        excerpt=_clip(out.excerpt, 400),
        tags=[_clip(t, 40) for t in out.tags[:5]],
        slug=slugify(out.slug),
        image_alt_hint=_clip(out.image_alt_hint, 300),
    )


def _named(out: _SeoOut, short: str) -> _SeoOut:
    """Swap any generic 'the author' the model wrote for the short name, across every text field."""

    def p(text: str) -> str:
        return personalise(text, short)

    return out.model_copy(
        update={
            "meta_title": p(out.meta_title),
            "meta_description": p(out.meta_description),
            "excerpt": p(out.excerpt),
            "tldr": p(out.tldr),
            "key_takeaways": personalise_all(out.key_takeaways, short),
            "faq": [_Faq(question=p(f.question), answer=p(f.answer)) for f in out.faq],
            "image_alt_hint": p(out.image_alt_hint),
            "social": _Social(linkedin=p(out.social.linkedin), x=p(out.social.x), facebook=p(out.social.facebook), threads=p(out.social.threads), bluesky=p(out.social.bluesky)),
        }
    )


class AzureSeoGenerator:
    def __init__(self, endpoint: str, deployment: str, api_version: str, timeout: float, credential: DefaultAzureCredential, site: str, author: str, short: str = "") -> None:
        token_provider = get_bearer_token_provider(credential, "https://cognitiveservices.azure.com/.default")
        self._client = AsyncAzureOpenAI(
            azure_endpoint=endpoint,
            api_version=api_version,
            azure_ad_token_provider=token_provider,
            timeout=timeout,
            max_retries=2,
        )
        self._deployment = deployment
        self._short = short
        checklist = f"\n\nThe LinkedIn and X posts are scored against this checklist:\nLinkedIn:\n{prompt_guidance('linkedin')}\nX:\n{prompt_guidance('x')}"
        self._system = _SYSTEM.format(site=site, author=author, persona=persona_rule(short, author) if short else "") + checklist
        self._concept_system = _CONCEPT_SYSTEM.format(site=site)

    async def generate(self, req: SeoRequest) -> SeoSuggestion:
        source = plain_text(req.body)[:_MAX_INPUT_CHARS]
        user = f"Content type: {req.kind.value}\nCategory: {req.category or 'n/a'}\nTitle: {req.title}\n\n---\n{source}"
        try:
            completion = await self._client.chat.completions.parse(
                model=self._deployment,
                messages=[{"role": "system", "content": self._system}, {"role": "user", "content": user}],
                response_format=_SeoOut,
                temperature=0.4,
            )
        except APITimeoutError as exc:
            log.warning("ai_seo_timeout")
            raise UpstreamUnavailable("The AI assistant took too long to respond. Try again in a moment.") from exc
        except APIError as exc:
            log.exception("ai_seo_failed")
            raise UpstreamUnavailable("The AI assistant is unavailable right now. You can still publish and fill SEO fields by hand.") from exc

        parsed = completion.choices[0].message.parsed
        if parsed is None:
            raise UpstreamUnavailable("The AI assistant couldn’t produce suggestions for this text. Try adding more body copy.")
        return to_suggestion(parsed, self._short)

    async def concept(self, req: SeoRequest, direction: str = "") -> str:
        source = plain_text(req.body)[:6_000]
        lead = f"Author's direction: {direction}\n" if direction else ""
        user = f"{lead}Content type: {req.kind.value}\nCategory: {req.category or 'n/a'}\nTitle: {req.title}\n\n---\n{source}"
        try:
            completion = await self._client.chat.completions.create(
                model=self._deployment,
                messages=[{"role": "system", "content": self._concept_system}, {"role": "user", "content": user}],
                temperature=0.8,
                max_tokens=90,
            )
        except APITimeoutError as exc:
            log.warning("ai_concept_timeout")
            raise UpstreamUnavailable("The AI assistant took too long to suggest a cover idea. Type one yourself or try again.") from exc
        except APIError as exc:
            log.exception("ai_concept_failed")
            raise UpstreamUnavailable("The AI assistant couldn’t suggest a cover idea right now. Type one yourself or try again.") from exc
        text = (completion.choices[0].message.content or "").strip().strip('"“”.').strip()
        if not text:
            raise UpstreamUnavailable("The AI assistant couldn’t suggest a cover idea for this piece. Type one yourself.")
        return _clip(text, 300)

    async def close(self) -> None:
        await self._client.close()


class OfflineSeoGenerator:
    """Deterministic fallback for tests and when Azure OpenAI is not configured."""

    async def generate(self, req: SeoRequest) -> SeoSuggestion:
        text = plain_text(req.body)
        first = text.split(". ")[0][:150]
        return SeoSuggestion(
            seo=SeoPack(meta_title=_clip(req.title, 60), meta_description=_clip(text, 155), tldr=_clip(text, 300), key_takeaways=[first] if first else []),
            social=SocialCopy(linkedin=_clip(text, 600), x=_clip(req.title, 240)),
            excerpt=_clip(text, 200),
            tags=[req.category] if req.category else [],
            slug=slugify(req.title),
            image_alt_hint="",
        )

    async def concept(self, req: SeoRequest, direction: str = "") -> str:
        return f"a simple drawn scene expressing {_clip((direction or req.title).lower(), 160)}"

    async def close(self) -> None:
        return None
