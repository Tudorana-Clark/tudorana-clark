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

**Automatic (GitHub Actions):** every push to `main` runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml). It detects whether `api/`, `web/` or both changed, runs that app's checks (ruff, mypy and pytest; tsc, eslint and `next build`), then deploys only what changed.
- Pull requests run the checks but never deploy.
- You can deploy by hand from **Actions → Test and deploy → Run workflow**.
- GitHub signs in to Azure with OIDC as the managed identity `id-tudoranaclark-deploy`, which has Contributor on `rg-tudoranaclark` only and trusts only this repo's `production` environment on `main`. There are no Azure keys or app secrets in GitHub; the Container Apps keep their own secrets.
- Repo variables: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`.

**From your machine:** needed for first-time setup and whenever secrets change, such as a rotated password or a renewed Entra client secret. It runs in "full" mode because `.secrets/app-secrets.json` exists:

```bash
az deployment group create -g rg-tudoranaclark -n platform -f infra/main.bicep -p developerPrincipalId=$(az ad signed-in-user show --query id -o tsv)
infra/deploy.sh              # builds in ACR (no local Docker needed), creates/updates both apps
infra/deploy.sh web          # front end only
SITE_URL=https://tudoranaclark.com infra/deploy.sh   # after the custom domain is bound
```
Secrets live in `.secrets/app-secrets.json` (git-ignored, chmod 600) and are stored as Container Apps secrets.

## Studio sign-in (Microsoft SSO)

`/studio` signs in with Microsoft Entra ID as **daniel@tudoranaclark.com**. Two locks keep anyone else out:
1. The Entra app **Tudorana Clark Studio** (single tenant) has *assignment required* on and only Daniel assigned, so Microsoft refuses everyone else.
2. The site checks Daniel's immutable Entra object ID (`STUDIO_ALLOWED_OIDS`) after verifying the token's signature, issuer, audience, nonce and tenant.

It uses the authorisation code flow with PKCE, and sessions last 12 hours. Password sign-in only appears where SSO isn't configured.
**Client secret expires 17 Nov 2028.** Before then, run `az ad app credential reset --id <ENTRA_CLIENT_ID> --display-name studio-web --years 2`, update `.secrets/app-secrets.json`, then run `infra/deploy.sh web`.
When the custom domain is live, add `https://tudoranaclark.com/studio/auth/callback` to the app's redirect URIs.
To give someone else access, assign them to the Entra app and add their object ID to `STUDIO_ALLOWED_OIDS`.

## Email notifications (Resend)

New newsletter subscribers and contact-form messages are emailed to `daniel@tudoranaclark.com` from `notifications@tudoranaclark.com` via Resend.
- Contact emails set *Reply-To* to the sender, so pressing Reply answers them directly.
- Emails are sent in the background with an idempotency key, after the record is saved, so a Resend outage never loses a submission or blocks the visitor.
- Repeat sign-ups don't trigger an email.
- The key is send-only, stored in `.secrets/app-secrets.json` as `RESEND_API_KEY` and as a Container Apps secret. Change the recipient with `NOTIFY_EMAIL`.

## Content model

`article`, `note` → `/<slug>` (as on Ghost; `/writing/<slug>` permanently redirects) · `research` → `/research/<slug>` · `talk`, `video` → `/speaking/<slug>`. The `/writing` index page stays.
A writing slug can't use a top-level address the site owns (`about`, `studio`, `writing`…), and the API refuses those with a clear message. The list is `RESERVED_SLUGS` in `web/src/lib/content.ts` and `api/app/service.py`.
Edits made outside the studio (scripts, imports) show up within 5 minutes, or straight away after `curl -X POST -H "x-admin-key: $ADMIN_API_KEY" <site>/api/revalidate`.
Cosmos container `content` is partitioned by `/kind` and has a unique `/slug`. `subscribers` and `messages` back the newsletter and contact forms; read them in **/studio/inbox**, with CSV export.

### Long-read blocks (research papers)

A research paper with three or more `##` headings becomes a long read with an "On this page" list. Inside the body, a fenced code block named after a block renders as a designed component. Each row's fields are separated by ` | `, and `@option value` lines set options. The fences are plain Markdown, so the `.md` copy and `llms-full.txt` stay readable. A block with a mistake renders as an ordinary code block and is logged as `doc_block_invalid`; the page itself never breaks.

| Block | Row format | Options |
|---|---|---|
| `stats` | `value \| label` | `@title` |
| `bars` | `label \| number \| optional note` | `@title` (required), `@unit`, `@max`, `@caption` |
| `callout` | free Markdown text | `@title`, `@tone finding` |
| `cards` | `title \| body` or `title \| tag \| body` | `@title` |
| `steps` | `title \| body` | `@title` |
| `glossary` | `term \| definition` (also published as schema.org `DefinedTermSet`) | `@title` |
| `sources` | `Authors (Year) \| Title \| Venue \| URL \| what it informed` (also published as the paper's `citation`) | `@title` |

The code is in `web/src/lib/doc-blocks.ts` (parsing) and `web/src/components/doc/` (rendering).

## Still to do

- **Brand photography:** upload in the studio, then redeploy with `PORTRAIT_URL=… STAGE_PHOTO_URL=…`.
- **Ghost migration:** export JSON, convert to Markdown and POST to `/v1/admin/content` with `published_at` set to keep the original dates (see `api/scripts/seed.py`).
- **Sending newsletters:** subscribers are stored now. Azure Communication Services Email can send them for about £0.0002 per email once the domain is verified.
- **Telemetry:** an Application Insights resource is provisioned but not wired in; add OpenTelemetry when you want traces.
