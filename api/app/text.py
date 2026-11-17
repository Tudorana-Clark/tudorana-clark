"""Pure text helpers: slugs, reading time, plain-text extraction."""

import math
import re

from slugify import slugify as _slugify

_WORDS_PER_MINUTE = 230
_MD_NOISE = re.compile(r"(```.*?```)|(`[^`]*`)|(!\[[^\]]*\]\([^)]*\))|(\[[^\]]*\]\([^)]*\))|[#>*_~\-]+", re.S)


def slugify(value: str) -> str:
    return _slugify(value, max_length=80, word_boundary=True) or "untitled"


def plain_text(markdown: str) -> str:
    def keep_link_text(m: re.Match[str]) -> str:
        if m.group(4):
            return m.group(4).split("]")[0].lstrip("[")
        return " "

    return re.sub(r"\s+", " ", _MD_NOISE.sub(keep_link_text, markdown)).strip()


def word_count(markdown: str) -> int:
    return len(plain_text(markdown).split())


def reading_minutes(markdown: str) -> int:
    return max(1, math.ceil(word_count(markdown) / _WORDS_PER_MINUTE))
