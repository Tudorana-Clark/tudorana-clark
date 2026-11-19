"""Generated copy names the author ("DTC"), never "the author"."""

from app.ai import _Faq, _SeoOut, _Social, to_suggestion
from app.config import Settings
from app.copy_engine import CopyEngine, Judgement, OfflineCopyJudge
from app.models import PostCopy
from app.persona import persona_rule, personalise


def test_personalise_swaps_generic_references() -> None:
    assert personalise("The author argues that data comes first.", "DTC") == "DTC argues that data comes first."
    assert personalise("In short, the author's view is simple.", "DTC") == "In short, DTC's view is simple."
    assert personalise("the writer’s point and the article's author agree", "DTC") == "DTC’s point and DTC agree"
    assert personalise("The note's author says so.", "DTC") == "DTC says so."


def test_personalise_leaves_other_meanings_alone() -> None:
    assert personalise("Authors of the report disagree; the authors cite ONS.", "DTC") == "Authors of the report disagree; the authors cite ONS."
    assert personalise("An authoritative source and a co-author.", "DTC") == "An authoritative source and a co-author."
    assert personalise("", "DTC") == "" and personalise("The author", "") == "The author"


def test_rule_names_both_forms() -> None:
    rule = persona_rule("DTC", "Daniel Tudorana-Clark")
    assert "call them DTC" in rule and "Never write 'the author'" in rule


def test_seo_output_is_personalised_everywhere() -> None:
    out = _SeoOut(
        meta_title="Why data comes first",
        meta_description="The author explains why data comes before chatbots.",
        slug="data-first",
        excerpt="The author's case for fixing data first.",
        tldr="The author argues that most AI projects fail on data.",
        key_takeaways=["The author has seen this with clients."],
        faq=[_Faq(question="What does the author recommend?", answer="The author recommends fixing the customer list.")],
        keywords=["ai data"],
        entities=["ONS"],
        tags=["AI"],
        image_alt_hint="",
        social=_Social(linkedin="I fixed the data first.", x="Data first.", facebook="The author shares a lesson.", threads="", bluesky=""),
    )
    s = to_suggestion(out, "DTC")
    texts = [s.excerpt, s.seo.meta_description, s.seo.tldr, *s.seo.key_takeaways, s.seo.faq[0].question, s.seo.faq[0].answer, s.social.facebook]
    assert all("author" not in t.lower() for t in texts), texts
    assert s.seo.tldr == "DTC argues that most AI projects fail on data."
    assert s.social.linkedin == "I fixed the data first."  # first-person posts are untouched


async def test_scorer_suggestions_name_dtc() -> None:
    class Judge(OfflineCopyJudge):
        async def judge(self, drafts, voice, labels=None):  # type: ignore[no-untyped-def]
            j = await super().judge(drafts, voice, labels)
            return Judgement(scores=j.scores, hook_type=j.hook_type, summary="Add a detail only the author could know.")

    score = await CopyEngine(Judge(), "DTC").score_post(PostCopy(linkedin="Short post with no detail.\n\nMore text here."), "", "")
    assert score.summary == "Add a detail only DTC could know."
    assert all("the author" not in c.basis.lower() for c in score.criteria)


def test_short_name_is_configurable() -> None:
    assert Settings(environment="test").author_short_name == "DTC"
    assert Settings(environment="test", author_short_name="Daniel").author_short_name == "Daniel"
