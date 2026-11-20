"""AI for the content studio: cover briefs, voice learning, idea mining and short-form post writing.

Every call is a single structured completion. Outputs are clamped to model limits so a verbose
model can never break a save. Nothing here invents facts: prompts restrict the model to the
author's own material.
"""

from __future__ import annotations

import logging
from typing import Protocol, TypeVar

from azure.identity.aio import DefaultAzureCredential, get_bearer_token_provider
from openai import APIError, APITimeoutError, AsyncAzureOpenAI
from pydantic import BaseModel, Field

from .claude_composer import ClaudeComposer
from .copy_rubric import prompt_guidance
from .errors import UpstreamUnavailable
from .models import CoverBrief, PostCopy
from .persona import persona_rule, personalise
from .text import plain_text

log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

DEFAULT_VOICE = (
    "British English. Plain, specific and calm; no hype, no buzzwords, no emoji. "
    "Short sentences. Lead with the point, then the evidence. Speak from first-hand experience with clients. "
    "Practical and quietly optimistic about technology, sceptical of easy answers."
)

_RULES = "Never invent facts, statistics, quotes, clients or results that are not in the material provided. If a point needs a number you don't have, make the point without one."


def clip(s: str, n: int) -> str:
    s = s.strip()
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


# ---------- Structured outputs ----------


class _Brief(BaseModel):
    label: str = Field(description="2-5 word name for this option, e.g. 'The iceberg'.")
    scene: str = Field(description="10-25 words: a concrete, drawable scene with at most two or three elements and what they are doing.")
    why: str = Field(description="One short sentence on how the scene expresses the piece's argument.")


class _Briefs(BaseModel):
    briefs: list[_Brief] = Field(description="Exactly four distinct options, each using a different metaphor.")


class _Voice(BaseModel):
    guide: str = Field(
        description=(
            "A practical tone-of-voice guide in 150-300 words, written as direct instructions to a ghostwriter "
            "('Write…', 'Avoid…'). Cover: stance and point of view, sentence rhythm, vocabulary and phrases the author uses, "
            "how arguments are structured, how evidence and experience are used, what to avoid. "
            "End with three short example lines that sound like the author."
        )
    )


class _IdeaOut(BaseModel):
    text: str = Field(description="A single standalone insight in 1-2 sentences, specific enough to become a LinkedIn post.")
    angle: str = Field(description="Under 15 words: why this would resonate or what hook to use.")


class _Ideas(BaseModel):
    ideas: list[_IdeaOut] = Field(description="Three to five distinct, non-overlapping ideas.")


class _PostOut(BaseModel):
    linkedin: str = Field(
        description=(
            "A LinkedIn post of 150-400 words. The first line is a hook under 80 characters that stands alone, followed by a blank line. "
            "Short paragraphs of 1-3 sentences, blank lines between them. One idea, made concrete with the author's experience or the material. "
            "End with the takeaway, or a genuine question only if it is one the author wants answered. At most 3 relevant hashtags on the last line. No links."
        )
    )
    x: str = Field(description="An X post of 70-260 characters: the sharpest single version of the insight, worth replying to or sending on. At most one hashtag. No links.")
    hook: str = Field(description="At most 140 characters: one quotable line in the author's voice for a quote card. No hashtags, no quotation marks.")


class _ExtractedSource(BaseModel):
    url: str = Field(description="The source's URL, copied exactly as it appears in the text.")
    title: str = Field(description="Title of the report, page or article.")
    publisher: str = Field(description="The organisation that published it, e.g. 'Office for National Statistics' or 'KPMG'.")
    published: str = Field(description="Month and year of publication as stated, e.g. 'June 2026'. Empty if the text doesn't say.")
    sponsor: str = Field(description="Who sponsored or paid for the research, if the text says. Empty otherwise.")
    findings: list[str] = Field(description="Each statistic or quotable finding attributed to this source, with figures exactly as written.")
    themes: list[str] = Field(description="1-3 short topic tags in Title Case, e.g. 'AI Adoption', 'Small Business', 'Jobs', 'Skills', 'Productivity', 'UK Economy'.")


class _Extracted(BaseModel):
    sources: list[_ExtractedSource]


class ExtractedSource(BaseModel):
    url: str
    title: str
    publisher: str
    published: str
    sponsor: str
    findings: list[str]
    themes: list[str]


# ---------- Protocol and implementations ----------


class StudioWriter(Protocol):
    async def cover_briefs(self, title: str, kind: str, body: str) -> list[CoverBrief]: ...
    async def learn_voice(self, samples: list[tuple[str, str]]) -> str: ...
    async def mine_ideas(self, title: str, kind: str, body: str, voice: str) -> list[tuple[str, str]]: ...
    async def write_post(self, seed: str, source: str, voice: str, current: PostCopy | None, instruction: str) -> PostCopy: ...
    async def extract_sources(self, text: str) -> list[ExtractedSource]: ...
    async def close(self) -> None: ...


def _to_copy(out: _PostOut) -> PostCopy:
    return PostCopy(linkedin=clip(out.linkedin, 3000), x=clip(out.x, 280), hook=clip(out.hook.strip().strip('"“”'), 220))


POST_CHECKLIST = f"The drafts are scored against this evidence-based checklist, so meet every point:\nLinkedIn:\n{prompt_guidance('linkedin')}\n\nX:\n{prompt_guidance('x')}"


class AzureStudioWriter:
    def __init__(
        self,
        endpoint: str,
        deployment: str,
        api_version: str,
        timeout: float,
        credential: DefaultAzureCredential,
        site: str,
        author: str,
        composer: ClaudeComposer | None = None,
        short: str = "",
    ) -> None:
        self._short = short
        # Post writing goes to Claude when configured (it decides the quality of every post); the rest stays on OpenAI.
        self._composer = composer
        token_provider = get_bearer_token_provider(credential, "https://cognitiveservices.azure.com/.default")
        self._client = AsyncAzureOpenAI(azure_endpoint=endpoint, api_version=api_version, azure_ad_token_provider=token_provider, timeout=timeout, max_retries=2)
        self._deployment = deployment
        self._site, self._author = site, author

    def _system(self, system: str) -> str:
        return f"{system}\n\n{persona_rule(self._short, self._author)}" if self._short else system

    def _p(self, text: str) -> str:
        return personalise(text, self._short)

    async def _parse(self, system: str, user: str, schema: type[T], temperature: float, what: str) -> T:
        try:
            completion = await self._client.chat.completions.parse(
                model=self._deployment,
                messages=[{"role": "system", "content": self._system(system)}, {"role": "user", "content": user}],
                response_format=schema,
                temperature=temperature,
            )
        except APITimeoutError as exc:
            log.warning("studio_ai_timeout", extra={"what": what})
            raise UpstreamUnavailable("The AI assistant took too long to respond. Try again in a moment.") from exc
        except APIError as exc:
            log.exception("studio_ai_failed", extra={"what": what})
            raise UpstreamUnavailable("The AI assistant is unavailable right now. Try again shortly.") from exc
        parsed = completion.choices[0].message.parsed
        if parsed is None:
            raise UpstreamUnavailable("The AI assistant couldn’t produce a result for this. Try adding more detail.")
        return parsed

    async def cover_briefs(self, title: str, kind: str, body: str) -> list[CoverBrief]:
        system = (
            f"You are the art director for {self._site}. Propose four cover illustration briefs for the piece below. "
            "Each is a different visual metaphor for the piece's central argument, drawable as a minimal flat hand-drawn illustration. "
            "Simple faceless figures and hands are allowed. Never text, letters, numbers, logos, screens or interfaces. "
            "Avoid clichés: robots, glowing brains, circuit boards, binary code, handshakes, lightbulbs, chess pieces, rockets, puzzle pieces. "
            "Make the four genuinely different: e.g. one about scale, one about a path or journey, one about tools, one about nature or growth."
        )
        user = f"Content type: {kind}\nTitle: {title}\n\n---\n{plain_text(body)[:8000]}"
        out = await self._parse(system, user, _Briefs, 0.9, "cover_briefs")
        return [CoverBrief(label=clip(b.label, 60), scene=clip(b.scene, 300), why=clip(self._p(b.why), 200)) for b in out.briefs[:4]]

    async def learn_voice(self, samples: list[tuple[str, str]]) -> str:
        system = (
            f"You are an editor studying how {self._author} writes, so a ghostwriter can match them exactly. "
            "Describe the voice you actually observe in the samples, with concrete detail; do not flatter or generalise."
        )
        user = "\n\n".join(f"### {t}\n{plain_text(b)[:3000]}" for t, b in samples)
        out = await self._parse(system, user, _Voice, 0.3, "learn_voice")
        return clip(self._p(out.guide), 4000)

    async def mine_ideas(self, title: str, kind: str, body: str, voice: str) -> list[tuple[str, str]]:
        system = (
            f"You help {self._author} recycle their own published work into short social posts. "
            "Extract standalone insights from the piece: surprising claims, practical lessons, contrarian takes, client patterns, useful frameworks. "
            f"Each must make sense without reading the piece. {_RULES}\n\nAuthor's voice:\n{voice}"
        )
        user = f"Content type: {kind}\nTitle: {title}\n\n---\n{plain_text(body)[:12000]}"
        out = await self._parse(system, user, _Ideas, 0.6, "mine_ideas")
        return [(clip(self._p(i.text), 600), clip(self._p(i.angle), 300)) for i in out.ideas[:5] if i.text.strip()]

    async def write_post(self, seed: str, source: str, voice: str, current: PostCopy | None, instruction: str) -> PostCopy:
        system = (
            f"You are {self._author}'s ghostwriter for short-form posts on LinkedIn and X. Write exactly in their voice. {_RULES}\n\n{POST_CHECKLIST}\n\nAuthor's voice:\n{voice}"
        )
        parts = [f"Idea to post about:\n{seed}"]
        if source:
            parts.append(f"Material from the author's own published piece (use it for specifics):\n{source}")
        if current and (current.linkedin or current.x):
            parts.append(f"Current drafts:\nLinkedIn:\n{current.linkedin}\n\nX:\n{current.x}\n\nQuote line:\n{current.hook}")
            parts.append(
                f"Revise the drafts. Change only what the instruction asks; keep what already works.\nInstruction: {instruction or 'Make them sharper and more like the author.'}"
            )
        elif instruction:
            parts.append(f"Extra direction: {instruction}")
        user = "\n\n".join(parts)
        if self._composer is not None:
            out = await self._composer.parse(self._system(system), user, _PostOut, "write_post", effort="medium")
        else:
            out = await self._parse(system, user, _PostOut, 0.7, "write_post")
        return _to_copy(out.model_copy(update={"linkedin": self._p(out.linkedin), "x": self._p(out.x), "hook": self._p(out.hook)}))

    async def extract_sources(self, text: str) -> list[ExtractedSource]:
        system = (
            "You turn research notes (often a report written by another AI assistant) into a structured list of sources. "
            "Include a source only if its URL appears in the text; copy URLs exactly. Group every finding under the source it is attributed to. "
            "Copy figures and wording exactly; never round, combine or add findings. Skip the notes' own commentary and conclusions."
        )
        out = await self._parse(system, text[:120_000], _Extracted, 0.0, "extract_sources")
        return [
            ExtractedSource(
                url=x.url.strip(),
                title=clip(x.title, 300),
                publisher=clip(x.publisher, 300),
                published=clip(x.published, 40),
                sponsor=clip(x.sponsor, 300),
                findings=[clip(f, 800) for f in x.findings[:20] if f.strip()],
                themes=[clip(t, 40) for t in x.themes[:3] if t.strip()],
            )
            for x in out.sources[:100]
        ]

    async def close(self) -> None:
        await self._client.close()


class OfflineStudioWriter:
    """Deterministic stand-in for tests and local runs without Azure OpenAI."""

    async def cover_briefs(self, title: str, kind: str, body: str) -> list[CoverBrief]:
        t = clip(title.lower(), 80)
        return [
            CoverBrief(label="Scale", scene=f"a small figure moving a large shape with ease, about {t}", why="Contrast of scale."),
            CoverBrief(label="Path", scene=f"a short glowing path beside a long winding road, about {t}", why="A better route."),
            CoverBrief(label="Tool", scene=f"one simple well-made tool on a plain table, about {t}", why="The practical answer."),
            CoverBrief(label="Growth", scene=f"a seedling rising beside a heavy block, about {t}", why="Small things growing."),
        ]

    async def learn_voice(self, samples: list[tuple[str, str]]) -> str:
        return f"{DEFAULT_VOICE} (Learned offline from {len(samples)} pieces.)"

    async def mine_ideas(self, title: str, kind: str, body: str, voice: str) -> list[tuple[str, str]]:
        first = plain_text(body).split(". ")[0][:300] or title
        return [(first, f"From “{clip(title, 80)}”")]

    async def write_post(self, seed: str, source: str, voice: str, current: PostCopy | None, instruction: str) -> PostCopy:
        base = clip(seed, 200)
        if current and instruction:
            return PostCopy(linkedin=clip(f"{current.linkedin}\n\n({instruction})", 3000), x=current.x, hook=current.hook)
        return PostCopy(linkedin=f"{base}\n\nWhat have you seen?", x=clip(base, 260), hook=clip(base, 140))

    async def extract_sources(self, text: str) -> list[ExtractedSource]:
        import re

        out = []
        for i, url in enumerate(dict.fromkeys(re.findall(r"https?://[^\s)\]>\"']+", text))):
            out.append(ExtractedSource(url=url.rstrip(".,;"), title=f"Source {i + 1}", publisher="Unknown publisher", published="", sponsor="", findings=[], themes=[]))
        return out

    async def close(self) -> None:
        return None
