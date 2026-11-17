# tudoranaclark.com

Founder-led publishing site for Daniel Tudorana-Clark, built from the brand design canvas.
**Next.js 16** front end and studio, **Python FastAPI** content API, all on low-cost **Azure**.

```
                 ┌──────────────── Azure Container Apps environment (UK South, consumption) ───────────────┐
 Readers ──HTTPS──▶  ca-tudoranaclark-web  (Next.js, public, scale-to-zero)                                │
 Crawlers / LLMs    │   SSR pages · /studio · OG images · sitemap · RSS · llms.txt · .md twins             │
                    │        │ http (internal only)                                                         │
                    │        ▼                                                                              │
                    │   ca-tudoranaclark-api  (FastAPI, internal ingress, scale-to-zero)                    │
                    └────────┼──────────────┬───────────────────┬───────────────────────────────────────────┘
                             │ managed identity (no keys anywhere)                │
                     Cosmos DB (free tier)  Blob Storage (media)  Azure OpenAI gpt-4.1-mini   IndexNow ping
```

## What makes publishing seamless

1. **/studio** → sign in → **New article**. Write in Markdown; paste or drop images straight in.
2. **Generate with AI** writes the meta title and description, a quotable *In short* summary, key takeaways, FAQ, keywords and entities, plus LinkedIn, X, Facebook, Threads and Bluesky posts. Everything stays editable, with live search and link-card previews.
3. **Publish**. If you skipped step 2, AI runs automatically first. The page is live straight away, because the cache is invalidated by tag. Bing, Copilot and ChatGPT search, Yandex, Seznam and Naver are pinged via IndexNow.
4. Share from the editor. Each network gets its own pre-written copy, UTM-tagged links and a branded 1200×630 card.

## AI-native SEO, built in

| Surface | Why it matters |
|---|---|
| schema.org graph per page (`BlogPosting` / `ScholarlyArticle` / `Event` / `VideoObject` + `FAQPage` + `BreadcrumbList`, all linked to one `Person`) | Lets search and answer engines attribute claims to Daniel |
| "In short" TL;DR and key takeaways at the top of each piece | Answer-first copy that assistants can quote word for word |
| `/llms.txt`, `/llms-full.txt` | A curated, LLM-readable map and the full text |
| `/<section>/<slug>.md` + `<link rel="alternate" type="text/markdown">` | A clean Markdown twin of every page, with front-matter |
| `robots.txt` explicitly allows GPTBot, ClaudeBot, PerplexityBot, Google-Extended and others | AI crawlers are welcome; the studio stays private |
| Highwire `citation_*` meta on research | Indexing by Google Scholar and research agents |
| Sitemap, RSS with full content, canonical URLs, `max-image-preview:large` | The classic SEO baseline |
| Dynamic OG/Twitter images in brand type, native Web Share, and share links for LinkedIn, X, Facebook, Threads, Bluesky, WhatsApp and email | Pieces are easy and attractive to share |

## Monthly cost (low traffic)

| Resource | SKU | Est. |
|---|---|---|
| Container Apps ×2 | Consumption, min 0 replicas | £0 (inside the free monthly grant*) |
| Cosmos DB | Free tier, throughput hard-capped at 1000 RU/s | £0 |
| Blob Storage | Standard LRS, hot | pennies |
| Azure OpenAI | gpt-4.1-mini, Global Standard, pay-per-token | ~£0.003 per generation |
| Container Registry | Basic | **~£4** (the only fixed cost) |
| Log Analytics | Daily cap 0.16 GB, inside the 5 GB free grant | £0 |

\*The free grant (180k vCPU-s, 2M requests) is per subscription and is shared with `app-el-trabajo`.
**Trade-off:** scale-to-zero means the first visit after an idle spell takes about 3–6 s. For instant first loads, run `az containerapp update -g rg-tudoranaclark -n ca-tudoranaclark-web --min-replicas 1`. That costs about £10–12 a month.

## Run locally

```bash
cd api && uv sync && uv run uvicorn app.main:app --port 8000      # uses your az login
cd web && npm ci && npm run dev                                     # http://localhost:3000
```
Copy `api/.env.example` → `api/.env` and `web/.env.example` → `web/.env.local`.
For a fully offline API, set `STORAGE_BACKEND=memory` and leave `OPENAI_ENDPOINT` empty.

Tests: `cd api && uv run pytest` · Type and lint checks: `cd web && npx tsc --noEmit && npx eslint src`

## Deploy

```bash
az deployment group create -g rg-tudoranaclark -n platform -f infra/main.bicep -p developerPrincipalId=$(az ad signed-in-user show --query id -o tsv)
infra/deploy.sh              # builds in ACR (no local Docker needed), creates/updates both apps
infra/deploy.sh web          # front end only
SITE_URL=https://tudoranaclark.com infra/deploy.sh   # after the custom domain is bound
```
Secrets live in `.secrets/app-secrets.json` (git-ignored, chmod 600) and are stored as Container Apps secrets.

## Content model

`article`, `note` → `/writing/<slug>` · `research` → `/research/<slug>` · `talk`, `video` → `/speaking/<slug>`.
Cosmos container `content` is partitioned by `/kind` and has a unique `/slug`. `subscribers` and `messages` back the newsletter and contact forms; read them in **/studio/inbox**, with CSV export.

## Still to do

- **Custom domain:** `az containerapp hostname add` + `bind` (managed certificate is free), then redeploy with `SITE_URL`.
- **Brand photography:** upload in the studio, then redeploy with `PORTRAIT_URL=… STAGE_PHOTO_URL=…`.
- **Ghost migration:** export JSON, convert to Markdown and POST to `/v1/admin/content` with `published_at` set to keep the original dates (see `api/scripts/seed.py`).
- **Sending newsletters:** subscribers are stored now. Azure Communication Services Email can send them for about £0.0002 per email once the domain is verified.
- **Telemetry:** an Application Insights resource is provisioned but not wired in; add OpenTelemetry when you want traces.
