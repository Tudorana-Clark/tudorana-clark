"""Seed the site with the content already written in the brand design.

Only copy that exists in the design is used; article bodies are short until the Ghost
migration lands. Idempotent: existing slugs are skipped.

Usage:  uv run python scripts/seed.py [API_URL]   (reads ADMIN_API_KEY from api/.env)
"""

import sys

import httpx

from app.config import get_settings

API = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
HEAD = {"x-admin-key": get_settings().admin_api_key.get_secret_value()}

ITEMS: list[dict[str, object]] = [
    {
        "kind": "article",
        "title": "Why small businesses can win the AI era",
        "category": "Artificial Intelligence",
        "tags": ["AI adoption", "Small business"],
        "excerpt": "For decades, new technology favoured the biggest players. AI is breaking that pattern: the most capable models are open to anyone, and they keep getting cheaper.",
        "body": "For decades, new technology favoured the biggest players.\n\nAI is breaking that pattern: the most capable models are open to anyone, and they keep getting cheaper.",
        "published_at": "2026-11-13T09:00:00Z",
    },
    {
        "kind": "article",
        "title": "What businesses actually ask me for when they say “we need AI”",
        "slug": "what-businesses-ask-for-when-they-say-we-need-ai",
        "category": "Artificial Intelligence",
        "tags": ["AI adoption", "Consulting"],
        "excerpt": "“I’ve tried this on my personal ChatGPT.” What that sentence really tells you about what a company wants from AI work.",
        "body": "“I’ve tried this on my personal ChatGPT.”\n\nWhat that sentence really tells you about what a company wants from AI work.",
        "published_at": "2026-11-09T09:00:00Z",
    },
    {
        "kind": "research",
        "title": "Calibrated Reliance Instrument",
        "slug": "calibrated-reliance-instrument",
        "subtitle": "Operationalising warranted and applied oversight in AI-assisted professional work.",
        "category": "MSc Computer Science, 2026",
        "tags": ["Human oversight", "AI reliance", "Research"],
        "excerpt": "Does the checking people do match what the task deserves? A traceable instrument that compares warranted oversight with applied oversight, and measures the reliance gap between them.",
        "body": (
            "This study investigated whether the scrutiny a task warrants can be compared, in a traceable software instrument, with the checking behaviour a user observably applies. "
            "A bounded literature review identified five dimensions of warranted oversight, encoded as nine binary factors in a deterministic, configurable scorer.\n\n"
            "A React and FastAPI application separated scoring from local model generation, recorded interaction signals and retained full provenance. "
            "Sensitivity analysis showed that classifications depend materially on researcher-selected weights, band edges and signal availability. No human participants were involved.\n\n"
            "## The reliance gap\n\n"
            "Compare what a task deserves with what the person actually did.\n\n"
            "- **W · Warranted oversight.** Five dimensions: consequence, verification demand, model-task evidence, verification capability, responsibility.\n"
            "- **A · Applied oversight.** Five observable signals, led by independent verification (0.40) and editing the output (0.20).\n"
            "- **G = L(W) − L(A).** A positive gap means recorded checking fell below the level the task warranted."
        ),
        "research": {
            "institution": "University of Hertfordshire",
            "citation": "Tudorana-Clark, D. (2026) Calibrated Reliance Instrument: operationalising warranted and applied oversight in AI-assisted professional work. MSc project, University of Hertfordshire.",
            "stats": [
                {"value": "512/512", "label": "task descriptors matched the oracle"},
                {"value": "2,304", "label": "transitions, zero score decreases"},
                {"value": "15/15", "label": "predefined scenarios matched"},
                {"value": "24.8%", "label": "reclassified by a ±20% weight change"},
            ],
        },
        "published_at": "2026-11-01T09:00:00Z",
    },
]

TALKS = [
    ("Sage TechNExt 2026", "2026-06-16"),
    ("National EdgeAI Hub", "2026-05-22"),
    ("Charlton Athletic Business Club", "2026-05-04"),
    ("Nottingham University x Lenovo", "2026-04-30"),
    ("DTX London 2025", "2025-10-03"),
]
for name, date in TALKS:
    ITEMS.append(
        {
            "kind": "talk",
            "title": name,
            "category": "Speaking",
            "tags": ["Speaking", "AI adoption"],
            "excerpt": f"Daniel Tudorana-Clark on practical AI adoption at {name}.",
            "body": f"Daniel Tudorana-Clark spoke at {name} on practical AI adoption for business leaders.",
            "event": {"name": name, "date": f"{date}T09:00:00Z", "location": ""},
            "published_at": f"{date}T09:00:00Z",
        }
    )


def main() -> None:
    with httpx.Client(base_url=API, headers=HEAD, timeout=30) as client:
        existing = {c["slug"] for c in client.get("/v1/admin/content").raise_for_status().json()["items"]}
        for raw in ITEMS:
            item = dict(raw)
            res = client.post("/v1/admin/content", json=item)
            if res.status_code == 409 or (res.is_success and res.json()["slug"] in existing):
                print("skip", item["title"])
                continue
            res.raise_for_status()
            doc = res.json()
            client.post(f"/v1/admin/content/{doc['id']}/publish").raise_for_status()
            print("published", doc["slug"])


if __name__ == "__main__":
    main()
