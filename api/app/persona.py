"""How generated copy refers to the person behind the site.

Anything written about them in the third person (summaries, takeaways, FAQ answers, excerpts, idea notes)
names them by their short name (AUTHOR_SHORT_NAME, "DTC" by default), never "the author". Posts and drafts
stay in their own first-person voice. The prompt asks for this; `personalise` enforces it on the way out,
so a model that slips still never shows "the author" in the studio or on the site.
"""

from __future__ import annotations

import re

_GENERIC = re.compile(
    r"\b(?P<the>[Tt]he)\s+(?:(?:article|piece|post|note|essay|paper|research)['’]s\s+)?(?:author|writer)(?P<plural>s)?\b",
)


def persona_rule(short: str, full: str) -> str:
    return (
        f"Whenever you refer to {full} in the third person, call them {short}: for example '{short} argues…' or '{short}'s view is…'. "
        f"Never write 'the author', 'the writer' or similar. Anything written as {short}'s own post or draft stays in the first person."
    )


def personalise(text: str, short: str) -> str:
    """Replace a generic 'the author' with the short name (plural forms are left alone; they mean other people)."""
    if not text or not short:
        return text

    def swap(m: re.Match[str]) -> str:
        return m.group(0) if m.group("plural") else short

    return _GENERIC.sub(swap, text)


def personalise_all(items: list[str], short: str) -> list[str]:
    return [personalise(t, short) for t in items]
