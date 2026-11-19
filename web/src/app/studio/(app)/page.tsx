import { connection } from "next/server";
import Link from "next/link";

import { admin, ApiError, studio } from "@/lib/api";
import { formatShort, KIND_LABEL, pathFor } from "@/lib/content";
import { StatusBadge } from "@/components/studio/StatusBadge";
import { type ContentScoreSummary, KINDS } from "@/lib/types";

export default async function StudioHome({ searchParams }: { searchParams: Promise<{ deleted?: string; status?: string }> }) {
  await connection();
  const { deleted, status } = await searchParams;
  let items: Awaited<ReturnType<typeof admin.list>> = [];
  let error: string | null = null;
  let scores = new Map<string, ContentScoreSummary>();
  try {
    // Scores are extra context: if they fail to load, the list still shows.
    const [list, summaries] = await Promise.all([admin.list(), studio.contentScores().catch(() => [] as ContentScoreSummary[])]);
    items = list;
    scores = new Map(summaries.map((s) => [s.id, s]));
  } catch (err) {
    error = err instanceof ApiError ? err.message : "Content couldn’t load.";
  }
  const shown = status === "draft" || status === "published" ? items.filter((i) => i.status === status) : items;
  const counts = { all: items.length, draft: items.filter((i) => i.status === "draft").length, published: items.filter((i) => i.status === "published").length };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className="display" style={{ fontSize: 40 }}>
            Content
          </h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 15 }}>Write in Markdown, let AI handle SEO and social copy, publish in one click.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {KINDS.map((k) => (
            <Link key={k} className="pill light sm" href={`/studio/new?kind=${k}`}>
              New {KIND_LABEL[k].toLowerCase()}
            </Link>
          ))}
        </div>
      </div>

      {deleted && (
        <p role="status" className="form-note" data-tone="success">
          Deleted. It’s been removed from the site.
        </p>
      )}

      <div role="group" aria-label="Filter by status" style={{ display: "flex", gap: 8 }}>
        {(
          [
            ["all", "All"],
            ["published", "Published"],
            ["draft", "Drafts"],
          ] as const
        ).map(([k, label]) => (
          <Link key={k} href={k === "all" ? "/studio" : `/studio?status=${k}`} className="chip" aria-pressed={(status ?? "all") === k} style={{ display: "inline-flex", alignItems: "center", color: (status ?? "all") === k ? "var(--white)" : "var(--ink)" }}>
            {label} · {counts[k]}
          </Link>
        ))}
      </div>

      <div style={{ background: "var(--white)", borderRadius: 24, overflow: "hidden" }}>
        {error ? (
          <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 12 }}>
            <span className="display" style={{ fontSize: 22 }}>
              Content couldn’t load
            </span>
            <p style={{ margin: 0, color: "var(--muted)" }}>{error}</p>
            <Link className="pill sm" href="/studio" style={{ alignSelf: "flex-start" }}>
              Try again
            </Link>
          </div>
        ) : shown.length === 0 ? (
          <div style={{ padding: 48, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
            <span className="display" style={{ fontSize: 26 }}>
              {items.length ? "Nothing in this view" : "Write your first piece"}
            </span>
            <p style={{ margin: 0, color: "var(--muted)" }}>{items.length ? "Try a different filter." : "Start with an article. AI will draft the SEO, summary, FAQ and social posts for you."}</p>
            <Link className="pill" href="/studio/new">
              New article
            </Link>
          </div>
        ) : (
          <div className="table-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15, minWidth: 820 }}>
              <caption className="sr-only">All content</caption>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 13 }}>
                  <th scope="col" style={{ padding: "16px 24px", fontWeight: 500 }}>
                    Title
                  </th>
                  <th scope="col" style={{ padding: 16, fontWeight: 500 }}>
                    Type
                  </th>
                  <th scope="col" style={{ padding: 16, fontWeight: 500 }}>
                    Status
                  </th>
                  <th scope="col" style={{ padding: 16, fontWeight: 500 }}>
                    Score
                  </th>
                  <th scope="col" style={{ padding: 16, fontWeight: 500 }}>
                    Updated
                  </th>
                  <th scope="col" style={{ padding: "16px 24px" }}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={{ padding: "16px 24px" }}>
                      <Link href={`/studio/${c.id}`} className="display" style={{ fontSize: 18 }}>
                        {c.title}
                      </Link>
                      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>{pathFor(c)}</div>
                    </td>
                    <td style={{ padding: 16, color: "var(--muted)" }}>{KIND_LABEL[c.kind]}</td>
                    <td style={{ padding: 16 }}>
                      <StatusBadge status={c.status} />
                    </td>
                    <td style={{ padding: 16 }}>
                      <ScoreCell score={scores.get(c.id)} />
                    </td>
                    <td style={{ padding: 16, color: "var(--muted)", whiteSpace: "nowrap" }}>{formatShort(c.updated_at)}</td>
                    <td style={{ padding: "16px 24px" }}>
                      {/* Two fixed slots, so Edit lines up on every row whether or not there's a View. */}
                      <div className="table-actions">
                        <Link className="pill ghost sm" href={`/studio/${c.id}`}>
                          Edit
                        </Link>
                        {c.status === "published" ? (
                          <a className="pill ghost sm" href={pathFor(c)} target="_blank" rel="noopener" aria-label={`View ${c.title} on the site`}>
                            View
                          </a>
                        ) : (
                          <span aria-hidden="true" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const BAND_LABEL: Record<ContentScoreSummary["band"], string> = { strong: "Strong", good: "Good", needs_work: "Needs work", weak: "Weak" };

function ScoreCell({ score }: { score: ContentScoreSummary | undefined }) {
  if (!score) return <span style={{ color: "var(--muted)", fontSize: 13 }}>Not scored</span>;
  return (
    <span className="score-cell" title={score.stale ? "Edited since it was scored" : undefined}>
      <span className="score-dot" data-band={score.band} aria-hidden="true" />
      <span>
        {score.total}
        <span className="sr-only"> out of 100, {BAND_LABEL[score.band]}</span>
      </span>
      {score.stale && <span style={{ color: "var(--muted)", fontSize: 12 }}>edited</span>}
    </span>
  );
}
