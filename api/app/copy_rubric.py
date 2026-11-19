"""The copy rubric: one list of criteria that both the writers and the scorer use.

Every criterion comes from the "Testing beats formulas for social copy" evidence review (2026) and keeps that
review's confidence rating, so the score weighs well-evidenced advice above vendor lore. Anything the review
rated as folklore (question hooks as a default, AIDA/PAS, posting times, hashtag tricks) is deliberately absent.

Two kinds of criterion:
  • rule  – checked in code here: instant, free and deterministic.
  • judge – needs reading: scored 0-4 by a model with a quoted line and a concrete rewrite (see copy_judge.py).

The score says how closely a draft follows the evidence. It is not a prediction of reach.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

Channel = Literal["linkedin", "x", "article"]
Confidence = Literal["high", "medium", "low"]
Kind = Literal["rule", "judge"]

# Well-evidenced advice counts for more than plausible inference.
CONFIDENCE_WEIGHT: dict[Confidence, float] = {"high": 1.0, "medium": 0.75, "low": 0.4}


@dataclass(frozen=True)
class Criterion:
    id: str
    channel: Channel
    kind: Kind
    label: str
    weight: int
    confidence: Confidence
    guidance: str  # what good looks like; goes into the writing prompt word for word
    basis: str  # one line on the evidence, shown in the studio


CRITERIA: tuple[Criterion, ...] = (
    # ---------- LinkedIn ----------
    Criterion(
        "li_hook_length",
        "linkedin",
        "rule",
        "Short opening line",
        3,
        "medium",
        "Open with a single line under 80 characters, then a line break.",
        "Hooks of 0-40 characters out-engaged 200+ (2.61% vs 2.08%) in two independent vendor datasets.",
    ),
    Criterion(
        "li_hook_alone",
        "linkedin",
        "rule",
        "Hook stands alone",
        2,
        "medium",
        "The first line must make sense on its own, above the 'see more' fold (about 140 characters on mobile).",
        "Readers scan; only the first line shows before the fold.",
    ),
    Criterion(
        "li_length",
        "linkedin",
        "rule",
        "Length 150-250 words",
        2,
        "medium",
        "Write 150-250 words in short paragraphs of one to three sentences. Go longer only when the idea earns it.",
        "Reach peaked at 150-174 words across 167,940 posts; engagement rose slightly above 250.",
    ),
    Criterion(
        "li_paragraphs",
        "linkedin",
        "rule",
        "Short paragraphs",
        1,
        "medium",
        "Keep every paragraph under about 50 words, with blank lines between them.",
        "Scanning evidence (NN/g): users read about 20% of a page.",
    ),
    Criterion(
        "li_no_bait",
        "linkedin",
        "rule",
        "No engagement bait",
        4,
        "high",
        "Never ask people to comment a word, like, tag someone or 'agree?'. Ask a real question or none.",
        "LinkedIn confirmed in March 2026 that it reduces distribution for 'comment to agree' prompts.",
    ),
    Criterion(
        "li_no_link",
        "linkedin",
        "rule",
        "No link in the post",
        2,
        "medium",
        "Keep links out of the post body.",
        "Link posts are consistently the weakest format in every dataset reviewed.",
    ),
    Criterion(
        "li_no_announce",
        "linkedin",
        "rule",
        "No announcement opener",
        2,
        "medium",
        "Never open with 'excited to announce', 'thrilled to share' or similar.",
        "Announcements sit at the bottom of the hook-type data.",
    ),
    Criterion(
        "li_not_question_hook",
        "linkedin",
        "rule",
        "Opens with a statement, not a question",
        1,
        "low",
        "Open with a story, a position or a result rather than a question.",
        "Question hooks ranked last of five in a 309,614-post analysis.",
    ),
    Criterion(
        "li_hashtags",
        "linkedin",
        "rule",
        "Three hashtags at most",
        1,
        "low",
        "Use at most three hashtags, on the last line.",
        "No evidence hashtags help; semantic ranking reads the topic from the text.",
    ),
    # ---------- X ----------
    Criterion(
        "x_no_bait",
        "x",
        "rule",
        "No engagement bait",
        4,
        "medium",
        "Never write 'reply with', 'like if', 'RT if' or 'follow for more'.",
        "X said in March 2026 it is close to downranking posts that solicit engagement.",
    ),
    Criterion(
        "x_no_link",
        "x",
        "rule",
        "No link in the post",
        2,
        "medium",
        "Keep links out of the post.",
        "Link posts from regular accounts fell to 0% median engagement after March 2025 (Buffer, 18.8M posts).",
    ),
    Criterion(
        "x_length",
        "x",
        "rule",
        "Short to mid length",
        1,
        "low",
        "Keep it between about 70 and 260 characters: one sharp idea.",
        "Text posts lead X engagement (3.56% median); 100-200 characters did best in one B2B study.",
    ),
    Criterion("x_hashtags", "x", "rule", "One hashtag at most", 1, "low", "Use at most one hashtag.", "Practitioner consensus only; hashtags crowd a short post."),
    # ---------- Article ----------
    Criterion(
        "a_headings",
        "article",
        "rule",
        "Descriptive headings",
        2,
        "medium",
        "Use at least three '## ' headings that say what each section argues.",
        "NN/g and the generative-engine (GEO) research both favour clear, scannable structure.",
    ),
    Criterion(
        "a_sources",
        "article",
        "rule",
        "Dated, named sources",
        3,
        "medium",
        "End with a Sources list; every entry names the publisher and the month and year.",
        "Cited sources raised visibility in generative engines by 27% (GEO paper).",
    ),
    Criterion(
        "a_figures",
        "article",
        "rule",
        "Real figures",
        2,
        "medium",
        "Use at least two specific, sourced statistics.",
        "Adding statistics raised generative-engine visibility by 31%; Hopkins: exact figures are believed.",
    ),
    Criterion(
        "a_title",
        "article",
        "rule",
        "Clear title of 8-17 words",
        1,
        "low",
        "Write a plain, specific title of roughly 8-17 words.",
        "Correlational: 14-17 word headlines earned more shares (2018) and 13-17 over-indexed on Substack (2026).",
    ),
    Criterion(
        "a_field_story",
        "article",
        "rule",
        "Your own story is in",
        3,
        "high",
        "Include the author's own first-hand story; never leave the placeholder.",
        "Platforms and the 2026 Edelman-LinkedIn report reward what only the author could supply.",
    ),
    # ---------- Judged (posts) ----------
    Criterion(
        "topic_first",
        "linkedin",
        "judge",
        "Topic clear from the first line",
        2,
        "low",
        "Name the topic plainly in the first line so both the reader and the feed's language model can place it.",
        "Inferred from LinkedIn's confirmed LLM-based retrieval.",
    ),
    Criterion(
        "lead",
        "linkedin",
        "judge",
        "Leads with a story, position or result",
        3,
        "medium",
        "Lead with a short story, a clear position or a concrete result.",
        "Story and contrarian hooks topped the largest LinkedIn hook dataset.",
    ),
    Criterion(
        "specific",
        "linkedin",
        "judge",
        "Specific, not generic",
        3,
        "medium",
        "Be specific: numbers, names, dates, concrete outcomes (only from the material provided).",
        "Hopkins' tested copy: exact figures are believed where superlatives are not.",
    ),
    Criterion(
        "only_you",
        "linkedin",
        "judge",
        "Something only you could write",
        4,
        "medium",
        "Include something only the author could say: a client pattern, a first-hand detail, a position they will defend.",
        "Platforms say they reward original thinking; suspected AI content is trusted about half as much.",
    ),
    Criterion(
        "conversation",
        "linkedin",
        "judge",
        "Worth replying to or forwarding",
        3,
        "medium",
        "Give people a real reason to reply or send it to a colleague: a useful takeaway or a position to engage with.",
        "Comments and shares, not likes, drive both feeds' ranking.",
    ),
    Criterion(
        "human",
        "linkedin",
        "judge",
        "Sounds like you, not generic AI",
        3,
        "medium",
        "Sound like the author: plain, specific, unhyped. No generic AI polish or filler.",
        "LinkedIn downranks content that reads as AI-generated slop; views of slop fell about 40%.",
    ),
    Criterion(
        "tight",
        "linkedin",
        "judge",
        "One idea, no padding",
        2,
        "medium",
        "One idea per post. Cut anything that doesn't serve it; a 10-20% trim usually helps.",
        "Raters preferred posts shortened by 10-20% (Gligoric et al.).",
    ),
    Criterion(
        "x_conversation",
        "x",
        "judge",
        "Earns replies, quotes and shares",
        3,
        "medium",
        "Write the sharpest single version of the idea: something people would reply to, quote or send on.",
        "X's published weights: share 20, reply and quote 5, like 0.5.",
    ),
    Criterion(
        "x_mute_risk",
        "x",
        "judge",
        "Low risk of mutes",
        3,
        "medium",
        "Avoid rage-bait, overpromising or anything likely to be muted or marked 'not interested'.",
        "X's negative weights (mute -58.8, block -31.2) dwarf the positive ones.",
    ),
    Criterion(
        "x_specific",
        "x",
        "judge",
        "Specific and in your voice",
        2,
        "medium",
        "Make it concrete and in the author's voice, not a generic aphorism.",
        "Exact claims are believed; generic polish reads as AI.",
    ),
    # ---------- Judged (article) ----------
    Criterion(
        "a_answer_first",
        "article",
        "judge",
        "Answer first",
        3,
        "medium",
        "State the argument or answer in the opening paragraphs.",
        "NN/g answer-first guidance; generative engines quote clear claims.",
    ),
    Criterion(
        "a_specific",
        "article",
        "judge",
        "Specific, not generic",
        3,
        "medium",
        "Make every section concrete: numbers, names, dates, examples.",
        "Hopkins: exact figures are believed. GEO: quotations +41%, statistics +31%.",
    ),
    Criterion(
        "a_only_you",
        "article",
        "judge",
        "Something only you could write",
        4,
        "medium",
        "Include first-hand experience, a defended position or proprietary evidence.",
        "The value of AI-assisted writing migrates to what AI can't supply.",
    ),
    Criterion(
        "a_human",
        "article",
        "judge",
        "Sounds like you, not generic AI",
        3,
        "medium",
        "Sound like the author: plain and specific, no hype, no filler transitions.",
        "Suspected AI content is trusted about half as much (Raptive, 3,000 adults).",
    ),
    Criterion(
        "a_return",
        "article",
        "judge",
        "A reason to come back",
        1,
        "medium",
        "Give readers a reason to subscribe or return: a practical takeaway or a promise of what's next.",
        "AI summaries halve clicks (Pew: 8% vs 15%); loyal readers matter more than search.",
    ),
)

BY_ID = {c.id: c for c in CRITERIA}


def criteria(channel: Channel, kind: Kind | None = None) -> list[Criterion]:
    return [c for c in CRITERIA if c.channel == channel and (kind is None or c.kind == kind)]


def prompt_guidance(channel: Channel) -> str:
    """The rubric as instructions for a writer. The scorer checks exactly these points."""
    lines = [f"- {c.guidance}" for c in sorted(criteria(channel), key=lambda c: -c.weight * CONFIDENCE_WEIGHT[c.confidence])]
    return "\n".join(lines)


# ---------- Rule checks ----------

Status = Literal["pass", "warn", "fail"]


@dataclass(frozen=True)
class RuleResult:
    id: str
    status: Status
    note: str
    suggestion: str = ""
    quote: str = ""


_URL = re.compile(r"https?://\S+|\bwww\.\S+", re.I)
_HASHTAG = re.compile(r"(?<!\w)#[A-Za-z][\w]*")
_LI_BAIT = re.compile(
    r"\b(comment\s+['\"“]?\w+['\"”]?\s+(below|if|and)|type\s+['\"“]?\w+['\"”]?\s+(below|in the comments)|like\s+(this\s+post\s+)?if\b|"
    r"tag\s+(someone|a\s+friend|a\s+colleague)|agree\s*\?|repost\s+if|share\s+if|drop\s+(a|an|your)\s+\S+\s+(below|in the comments)|"
    r"follow\s+(me\s+)?for\s+more|smash\s+(that|the)\s+like)",
    re.I,
)
_X_BAIT = re.compile(
    r"\b(reply\s+with|like\s+if|rt\s+if|retweet\s+if|repost\s+if|follow\s+(me\s+)?for\s+more|drop\s+(a|an|your)\s+\S+|quote\s+this\s+with|bookmark\s+this)\b",
    re.I,
)
_ANNOUNCE = re.compile(
    r"^\W*(i\s+am\s+|i['’]?m\s+|we\s+are\s+|we['’]?re\s+)?(so\s+|very\s+|really\s+)?"
    r"(excited|thrilled|delighted|pleased|proud|happy)\s+to\s+(announce|share|say|introduce|launch)",
    re.I,
)
_PLACEHOLDER = re.compile(r"\*\*\[(From the field|Evidence needed)", re.I)
_FIGURE = re.compile(r"(?<![\w.])(?:£|\$|€)?\d[\d,]*(?:\.\d+)?\s?(?:%|per\s?cent|percent|bn|billion|m\b|million|x\b)?", re.I)
_YEAR = re.compile(r"\b(19|20)\d{2}\b")


def _words(text: str) -> int:
    return len(re.findall(r"\b[\w'’-]+\b", text))


def _first_line(text: str) -> str:
    for line in text.strip().splitlines():
        if line.strip():
            return line.strip()
    return ""


def _short(s: str, n: int = 120) -> str:
    s = s.strip()
    return s if len(s) <= n else s[: n - 1] + "…"


def check_linkedin(text: str, role: str = "") -> list[RuleResult]:
    t = text.strip()
    if not t:
        return []
    out: list[RuleResult] = []
    first = _first_line(t)
    n = len(first)
    if n <= 80:
        out.append(RuleResult("li_hook_length", "pass", f"Opening line is {n} characters."))
    elif n <= 140:
        out.append(
            RuleResult(
                "li_hook_length",
                "warn",
                f"Opening line is {n} characters; under 80 tends to do better.",
                "Cut the opening line to under 80 characters and move the rest down.",
                _short(first),
            )
        )
    else:
        out.append(
            RuleResult(
                "li_hook_length", "fail", f"Opening line is {n} characters, so it's cut off before the fold.", "Rewrite the opening as one line under 80 characters.", _short(first)
            )
        )

    lines = t.splitlines()
    alone = len(lines) > 1 and (not lines[1].strip() or n <= 140)
    out.append(
        RuleResult("li_hook_alone", "pass", "The hook sits on its own line.")
        if alone
        else RuleResult("li_hook_alone", "fail", "The opening runs straight into the next sentence.", "Put the hook on its own line, followed by a blank line.", _short(first))
    )

    w = _words(t)
    if 150 <= w <= 250:
        out.append(RuleResult("li_length", "pass", f"{w} words."))
    elif 100 <= w < 150 or 250 < w <= 350:
        tip = "Add one concrete detail or example." if w < 150 else "Trim to about 250 words unless every line earns its place."
        out.append(RuleResult("li_length", "warn", f"{w} words; 150-250 is the sweet spot.", tip))
    else:
        tip = "Develop the idea with one concrete example to reach about 150 words." if w < 100 else "Cut to 150-250 words, or turn this into an article."
        out.append(RuleResult("li_length", "fail", f"{w} words; 150-250 is the sweet spot.", tip))

    paras = [p for p in re.split(r"\n\s*\n", t) if p.strip()]
    longest = max((_words(p) for p in paras), default=0)
    out.append(
        RuleResult("li_paragraphs", "pass", "Paragraphs are short and scannable.")
        if longest <= 50
        else RuleResult("li_paragraphs", "warn", f"One paragraph runs to {longest} words.", "Break long paragraphs into one to three sentences each.")
    )

    bait = _LI_BAIT.search(t)
    out.append(
        RuleResult(
            "li_no_bait",
            "fail",
            "Contains an engagement-bait prompt that LinkedIn now suppresses.",
            "Replace it with a genuine question, or end on the takeaway.",
            _short(bait.group(0)),
        )
        if bait
        else RuleResult("li_no_bait", "pass", "No engagement-bait prompts.")
    )

    link = _URL.search(t)
    if not link:
        out.append(RuleResult("li_no_link", "pass", "No link in the post."))
    elif role == "link":
        out.append(
            RuleResult(
                "li_no_link",
                "warn",
                "This is the launch post, so it carries the link; expect lower reach.",
                "Test putting the link in the first comment instead.",
                _short(link.group(0)),
            )
        )
    else:
        out.append(
            RuleResult("li_no_link", "fail", "A link in the post body reduces reach.", "Remove the link; point to your profile or the newsletter instead.", _short(link.group(0)))
        )

    out.append(
        RuleResult("li_no_announce", "fail", "Opens like an announcement.", "Open with the result, the story or your position instead.", _short(first))
        if _ANNOUNCE.search(first)
        else RuleResult("li_no_announce", "pass", "Doesn't open like an announcement.")
    )
    out.append(
        RuleResult("li_not_question_hook", "warn", "Opens with a question.", "Turn the question into the answer or a clear position.", _short(first))
        if first.endswith("?")
        else RuleResult("li_not_question_hook", "pass", "Opens with a statement.")
    )
    tags = len(_HASHTAG.findall(t))
    out.append(
        RuleResult("li_hashtags", "pass", f"{tags} hashtag{'s' if tags != 1 else ''}.")
        if tags <= 3
        else RuleResult("li_hashtags", "warn", f"{tags} hashtags.", "Keep the three most relevant hashtags, on the last line.")
    )
    return out


def check_x(text: str, role: str = "") -> list[RuleResult]:
    t = text.strip()
    if not t:
        return []
    out: list[RuleResult] = []
    bait = _X_BAIT.search(t)
    out.append(
        RuleResult(
            "x_no_bait", "fail", "Asks for engagement directly, which X is moving to downrank.", "Cut the request; make the post itself worth replying to.", _short(bait.group(0))
        )
        if bait
        else RuleResult("x_no_bait", "pass", "No engagement-bait prompts.")
    )
    link = _URL.search(t)
    if not link:
        out.append(RuleResult("x_no_link", "pass", "No link in the post."))
    elif role == "link":
        out.append(
            RuleResult("x_no_link", "warn", "The launch post carries the link; expect lower reach.", "Test posting the link as a reply to your own post.", _short(link.group(0)))
        )
    else:
        out.append(RuleResult("x_no_link", "fail", "Links sharply reduce reach on X.", "Remove the link, or post it as a reply to your own post.", _short(link.group(0))))
    n = len(t)
    if 70 <= n <= 260:
        out.append(RuleResult("x_length", "pass", f"{n} characters."))
    else:
        tip = "Add the one concrete detail that makes it land." if n < 70 else "Trim to the single sharpest sentence."
        out.append(RuleResult("x_length", "warn", f"{n} characters.", tip))
    tags = len(_HASHTAG.findall(t))
    out.append(
        RuleResult("x_hashtags", "pass", f"{tags} hashtag{'s' if tags != 1 else ''}.")
        if tags <= 1
        else RuleResult("x_hashtags", "warn", f"{tags} hashtags.", "Keep one hashtag at most.")
    )
    return out


# Which long-form rule checks apply to each kind of content. Articles and research papers are long reads that
# need structure, figures and a Sources list; notes, talks and videos are short pages where those would be
# padding, so they're judged on the copy itself (the judged criteria apply to every kind).
LONG_FORM_RULES = {"a_headings", "a_sources", "a_figures", "a_title", "a_field_story"}
RULES_BY_KIND: dict[str, set[str]] = {
    "article": LONG_FORM_RULES,
    "research": LONG_FORM_RULES,
    "note": {"a_field_story"},
    "talk": {"a_field_story"},
    "video": {"a_field_story"},
}


def check_article(title: str, body: str, kind: str = "article") -> list[RuleResult]:
    applies = RULES_BY_KIND.get(kind, LONG_FORM_RULES)
    return [r for r in _check_long_form(title, body) if r.id in applies]


def _check_long_form(title: str, body: str) -> list[RuleResult]:
    b = body.strip()
    if not b:
        return []
    out: list[RuleResult] = []
    parts = re.split(r"^##\s+Sources\s*$", b, maxsplit=1, flags=re.M | re.I)
    main = parts[0]
    sources = parts[1] if len(parts) > 1 else ""

    headings = re.findall(r"^##\s+(.+)$", main, flags=re.M)
    out.append(
        RuleResult("a_headings", "pass", f"{len(headings)} section headings.")
        if len(headings) >= 3
        else RuleResult(
            "a_headings",
            "fail",
            f"Only {len(headings)} section heading{'s' if len(headings) != 1 else ''}.",
            "Break the piece into at least three sections with headings that state each point.",
        )
    )

    entries = [ln for ln in sources.splitlines() if ln.strip().startswith(("-", "*", "1", "2", "3", "4", "5", "6", "7", "8", "9"))]
    if not entries:
        out.append(RuleResult("a_sources", "fail", "No Sources list at the end.", "Add a '## Sources' list naming each publisher, title, month and year."))
    else:
        undated = [e for e in entries if not _YEAR.search(e)]
        out.append(
            RuleResult("a_sources", "pass", f"{len(entries)} sources, all dated.")
            if not undated
            else RuleResult(
                "a_sources", "warn", f"{len(undated)} of {len(entries)} sources have no date.", "Add the month and year to every source.", _short(undated[0].strip("-* "))
            )
        )

    figures = {m.group(0).strip() for m in _FIGURE.finditer(re.sub(r"^#.*$", "", main, flags=re.M)) if not _YEAR.fullmatch(m.group(0).strip())}
    figures = {f for f in figures if len(f.strip("£$€")) > 1 or "%" in f}
    out.append(
        RuleResult("a_figures", "pass", f"{len(figures)} specific figures.")
        if len(figures) >= 2
        else RuleResult("a_figures", "warn", "Fewer than two specific figures.", "Add two sourced statistics where the argument needs evidence.")
    )

    tw = _words(title)
    out.append(
        RuleResult("a_title", "pass", f"Title is {tw} words.")
        if 8 <= tw <= 17
        else RuleResult(
            "a_title", "warn", f"Title is {tw} words.", "Aim for a plain, specific title of 8-17 words." if tw < 8 else "Tighten the title to 17 words or fewer.", _short(title)
        )
    )

    out.append(
        RuleResult("a_field_story", "fail", "Your own story is still a placeholder.", "Write the 'From the field' section from your own experience.")
        if _PLACEHOLDER.search(b)
        else RuleResult("a_field_story", "pass", "No placeholders left.")
    )
    return out
