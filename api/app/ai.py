"""AI SEO pack: one structured call to Azure OpenAI produces everything search and answer engines read."""

from __future__ import annotations

import logging
from typing import Protocol

from azure.identity.aio import DefaultAzureCredential, get_bearer_token_provider
from openai import APIError, APITimeoutError, AsyncAzureOpenAI
from pydantic import BaseModel, Field

from .errors import UpstreamUnavailable
from .models import FaqItem, SeoPack, SeoRequest, SeoSuggestion, SocialCopy
from .text import plain_text, slugify

log = logging.getLogger(__name__)

_MAX_INPUT_CHARS = 24_000  # ~6k tokens keeps each call well under a cent


class _Faq(BaseModel):
    question: str
    answer: str


class _Social(BaseModel):
    linkedin: str = Field(description="120-220 words. Hook line, 3 short paragraphs, 1 question to invite comments, 3 hashtags at the end. No link; it is added separately.")
    x: str = Field(description="Max 240 characters, punchy, no hashtags spam (max 1). No link.")
    facebook: str = Field(description="2-3 sentences, conversational.")
    threads: str = Field(description="Max 400 characters, conversational.")
    bluesky: str = Field(description="Max 260 characters.")


class _SeoOut(BaseModel):
    meta_title: str = Field(description="50-60 characters, primary keyword first, no site name.")
    meta_description: str = Field(description="140-158 characters, states the answer, invites the click.")
    slug: str = Field(description="3-6 lowercase words joined by hyphens.")
    excerpt: str = Field(description="1-2 sentences for listing cards, under 220 characters.")
    tldr: str = Field(description="A 2-3 sentence direct answer an AI assistant could quote verbatim, written in third person about the author's argument.")
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
    "Prefer concrete, specific language over hype. No emoji. No clickbait."
)


class SeoGenerator(Protocol):
    async def generate(self, req: SeoRequest) -> SeoSuggestion: ...
    async def close(self) -> None: ...


def _clip(s: str, n: int) -> str:
    s = s.strip()
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def to_suggestion(out: _SeoOut) -> SeoSuggestion:
    """Clamp model output to our validated limits so a verbose model can never break a save."""
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


class AzureSeoGenerator:
    def __init__(self, endpoint: str, deployment: str, api_version: str, timeout: float, credential: DefaultAzureCredential, site: str, author: str) -> None:
        token_provider = get_bearer_token_provider(credential, "https://cognitiveservices.azure.com/.default")
        self._client = AsyncAzureOpenAI(
            azure_endpoint=endpoint,
            api_version=api_version,
            azure_ad_token_provider=token_provider,
            timeout=timeout,
            max_retries=2,
        )
        self._deployment = deployment
        self._system = _SYSTEM.format(site=site, author=author)

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
        return to_suggestion(parsed)

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

    async def close(self) -> None:
        return None
