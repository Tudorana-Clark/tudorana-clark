import Link from "next/link";
import { connection } from "next/server";

import { ArticleStart } from "@/components/studio/ArticleStart";
import { ApiError, studio } from "@/lib/api";
import { formatShort } from "@/lib/content";
import type { ArticleWork } from "@/lib/types";

function stage(w: ArticleWork): string {
  if (w.distributed.length) return "Posts planned";
  if (w.check) return "Checked";
  if (w.content_id) return "Drafted";
  if (w.sources.length) return "Researching";
  if (w.outline.length) return "Outlined";
  return "Brief";
}

export default async function WritePage() {
  await connection();
  let plans: ArticleWork[] = [];
  let error: string | null = null;
  try {
    plans = await studio.articles();
  } catch (err) {
    error = err instanceof ApiError ? err.message : "Your article plans couldn’t load.";
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 960 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className="display" style={{ fontSize: 40 }}>
            Write an article
          </h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 15 }}>From insight to a sourced, fact-checked 600–900 word draft, following your playbook.</p>
        </div>
        <Link className="pill ghost sm" href="/studio/voice">
          Voice &amp; playbook
        </Link>
      </div>

      <ArticleStart insight="" sourceRef={null} ideaId={null} />

      <section aria-labelledby="plans-h" style={{ background: "var(--white)", borderRadius: 24, overflow: "hidden" }}>
        <h2 id="plans-h" style={{ margin: 0, padding: "20px 24px 12px", fontSize: 18, fontWeight: 600 }}>
          In progress
        </h2>
        {error ? (
          <p role="alert" style={{ margin: 0, padding: "0 24px 24px", color: "var(--muted)" }}>
            {error}
          </p>
        ) : plans.length === 0 ? (
          <p style={{ margin: 0, padding: "0 24px 24px", color: "var(--muted)" }}>No article plans yet. Start one above, or turn an idea from your Posts idea bank into an article.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {plans.map((w) => (
              <li key={w.id} style={{ borderTop: "1px solid var(--line)" }}>
                <Link href={`/studio/write/${w.id}`} className="post-row">
                  <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.headline || w.insight}</span>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>
                      {w.sources.length} sources · Updated {formatShort(w.updated_at)}
                    </span>
                  </span>
                  <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, background: "var(--card)", color: "var(--muted)", whiteSpace: "nowrap" }}>{stage(w)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
