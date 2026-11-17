"""Maintain AI covers. See app/cover_style/README.md.

  refs  --out DIR [--count N] [--kind K]   Render style-anchor candidates locally (text-to-image) to pick references from.
  plan  API_URL --out PLAN.json            Render a new cover for every post whose cover is on an older style version.
                                           Uses each post's saved concept, uploads candidates, changes no posts.
  apply API_URL PLAN.json                  Swap the planned covers in. Skips posts edited since the plan was made.

Reads ADMIN_API_KEY and IMAGE_* settings from api/.env. `refs` calls Foundry directly with your az login.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from azure.identity.aio import DefaultAzureCredential

from app.config import get_settings
from app.covers import STYLE_VERSION, MaiImageClient, build_prompt
from app.models import ContentIn, Kind

REF_CONCEPTS = [
    "a small sailboat catching a strong wind and overtaking a large anchored ship",
    "two hands passing a glowing seed between them",
    "a winding path up a gentle hill with a small figure halfway",
    "a set of scales balancing a feather against a stack of stones",
    "a small plant growing through a crack between large blocks",
    "an open window with a kite rising into a wide sky",
    "a simple figure arranging a few large shapes into a bridge",
    "a compass resting on an unfolded map with one path highlighted",
]


def _admin(api: str) -> httpx.Client:
    key = get_settings().admin_api_key.get_secret_value()
    if not key:
        sys.exit("ADMIN_API_KEY is not set in api/.env")
    return httpx.Client(base_url=api.rstrip("/"), headers={"x-admin-key": key}, timeout=300)


async def refs(out: Path, count: int, kind: Kind) -> None:
    s = get_settings()
    if not s.image_endpoint:
        sys.exit("IMAGE_ENDPOINT is not set in api/.env")
    async with DefaultAzureCredential() as cred:
        client = MaiImageClient(s.image_endpoint, s.image_deployment, s.cover_width, s.cover_height, s.image_timeout_seconds, cred)
        try:
            for i in range(count):
                concept = REF_CONCEPTS[i % len(REF_CONCEPTS)]
                png = await client.render(build_prompt(kind, concept, with_references=False), [])
                path = out / f"{kind.value}-{i + 1:02d}.png"
                await asyncio.to_thread(path.write_bytes, png)
                print(f"✓ {path}  ({concept})")
        finally:
            await client.close()
    print(f"\nPick 3–4 and copy them to app/cover_style/{STYLE_VERSION}/ as 01.png, 02.png, …")


def plan(api: str, out: Path) -> None:
    rows: list[dict[str, Any]] = []
    with _admin(api) as http:
        items = http.get("/v1/admin/content", params={"limit": 500}).raise_for_status().json()["items"]
        for summary in items:
            doc = http.get(f"/v1/admin/content/{summary['id']}").raise_for_status().json()
            cover = doc.get("cover")
            if not cover or cover["style_version"] == STYLE_VERSION:
                continue  # real photo, or already current
            req = {"kind": doc["kind"], "title": doc["title"], "category": doc["category"], "concept": cover["concept"], "literal": True}
            res = http.post("/v1/admin/ai/covers", json=req)
            if res.is_error:
                print(f"✗ {doc['slug']}: {res.json().get('detail', res.text)}")
                continue
            result = res.json()
            pick = result["candidates"][0]
            rows.append(
                {
                    "id": doc["id"],
                    "slug": doc["slug"],
                    "updated_at": doc["updated_at"],
                    "old_url": doc["feature_image"]["url"] if doc.get("feature_image") else None,
                    "new_url": pick["url"],
                    "alternatives": [c["url"] for c in result["candidates"][1:]],
                    "feature_image": {"url": pick["url"], "alt": result["alt"], "width": pick["width"], "height": pick["height"]},
                    "cover": {"style_version": result["style_version"], "model": result["model"], "concept": result["concept"], "generated_at": datetime.now(UTC).isoformat()},
                }
            )
            print(f"• {doc['slug']}\n    old {rows[-1]['old_url']}\n    new {pick['url']}")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(rows, indent=2))
    print(f"\n{len(rows)} cover(s) planned → {out}\nReview the new URLs (swap in an alternative by editing new_url/feature_image.url), then run apply.")


def apply(api: str, plan_file: Path) -> None:
    rows = json.loads(plan_file.read_text())
    fields = set(ContentIn.model_fields)
    with _admin(api) as http:
        for row in rows:
            doc = http.get(f"/v1/admin/content/{row['id']}").raise_for_status().json()
            if doc["updated_at"] != row["updated_at"]:
                print(f"↷ {row['slug']}: edited since the plan was made, skipped")
                continue
            body = {k: v for k, v in doc.items() if k in fields}
            body["feature_image"], body["cover"] = row["feature_image"], row["cover"]
            res = http.put(f"/v1/admin/content/{row['id']}", json=body)
            print(f"{'✓' if res.is_success else '✗'} {row['slug']}" + ("" if res.is_success else f": {res.text[:200]}"))
    print("\nThe site picks up changes within 5 minutes (or on the next publish from the studio).")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("refs")
    r.add_argument("--out", type=Path, required=True)
    r.add_argument("--count", type=int, default=8)
    r.add_argument("--kind", type=Kind, default=Kind.article)
    pl = sub.add_parser("plan")
    pl.add_argument("api")
    pl.add_argument("--out", type=Path, required=True)
    ap = sub.add_parser("apply")
    ap.add_argument("api")
    ap.add_argument("plan", type=Path)
    a = p.parse_args()
    if a.cmd == "refs":
        a.out.mkdir(parents=True, exist_ok=True)
        asyncio.run(refs(a.out, a.count, a.kind))
    elif a.cmd == "plan":
        plan(a.api, a.out)
    else:
        apply(a.api, a.plan)


if __name__ == "__main__":
    main()
