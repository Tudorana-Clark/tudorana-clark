import Link from "next/link";
import { notFound } from "next/navigation";

import { Editor } from "@/components/studio/Editor";
import { admin, ApiError, studio } from "@/lib/api";
import { site } from "@/lib/site";
import { tagSuggestions } from "@/lib/tags";
import type { Content, ContentScores } from "@/lib/types";

async function load(id: string): Promise<{ content: Content; items: Awaited<ReturnType<typeof admin.list>>; score: ContentScores | null } | { error: string }> {
  try {
    // The stored copy score is optional: if it can't load, the editor still opens and can score afresh.
    const [content, items, score] = await Promise.all([admin.get(id), admin.list().catch(() => []), studio.contentScore(id).catch(() => null)]);
    return { content, items, score };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    return { error: err instanceof ApiError ? err.message : "Please try again." };
  }
}

export default async function EditContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await load(id);
  if ("content" in result) return <Editor key={result.content.id} initial={result.content} siteUrl={site.url} tagSuggestions={tagSuggestions(result.items, result.content.id)} initialScore={result.score} />;
  return (
    <div role="alert" style={{ background: "var(--white)", borderRadius: 24, padding: 32, display: "flex", flexDirection: "column", gap: 12 }}>
      <h1 className="display" style={{ fontSize: 28 }}>
        This piece couldn’t load
      </h1>
      <p style={{ margin: 0, color: "var(--muted)" }}>{result.error}</p>
      <Link className="pill sm" href={`/studio/${id}`} style={{ alignSelf: "flex-start" }}>
        Try again
      </Link>
    </div>
  );
}
