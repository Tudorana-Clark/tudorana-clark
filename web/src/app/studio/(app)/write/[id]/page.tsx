import Link from "next/link";
import { notFound } from "next/navigation";

import { ArticleWorkbench } from "@/components/studio/ArticleWorkbench";
import { ApiError, studio } from "@/lib/api";
import type { ArticleWork } from "@/lib/types";

async function load(id: string): Promise<{ work: ArticleWork } | { error: string }> {
  try {
    return { work: await studio.article(id) };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    return { error: err instanceof ApiError ? err.message : "Please try again." };
  }
}

export default async function ArticleWorkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await load(id);
  if ("work" in result)
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Link href="/studio/write" style={{ fontSize: 14, color: "var(--muted)" }}>
          ← All article plans
        </Link>
        <h1 className="display" style={{ fontSize: 32, lineHeight: 1.15, maxWidth: 960 }}>
          {result.work.headline || result.work.insight.slice(0, 120)}
        </h1>
        <ArticleWorkbench key={result.work.id} initial={result.work} />
      </div>
    );
  return (
    <div role="alert" style={{ background: "var(--white)", borderRadius: 24, padding: 32, display: "flex", flexDirection: "column", gap: 12 }}>
      <h1 className="display" style={{ fontSize: 28 }}>
        This article plan couldn’t load
      </h1>
      <p style={{ margin: 0, color: "var(--muted)" }}>{result.error}</p>
      <Link className="pill sm" href={`/studio/write/${id}`} style={{ alignSelf: "flex-start" }}>
        Try again
      </Link>
    </div>
  );
}
