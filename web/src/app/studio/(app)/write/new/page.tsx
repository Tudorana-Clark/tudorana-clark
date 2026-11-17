import Link from "next/link";
import { connection } from "next/server";

import { ArticleStart } from "@/components/studio/ArticleStart";
import { admin, studio } from "@/lib/api";
import { pathFor } from "@/lib/content";
import type { SourceRef } from "@/lib/types";

/** Start an article from an idea (?idea=), a post (?post=) or an existing piece (?from=). */
export default async function NewArticlePage({ searchParams }: { searchParams: Promise<{ idea?: string; post?: string; from?: string }> }) {
  await connection();
  const { idea, post, from } = await searchParams;
  let insight = "";
  let sourceRef: SourceRef | null = null;
  let ideaId: string | null = null;
  if (idea) {
    const found = (await studio.ideas().catch(() => [])).find((i) => i.id === idea);
    if (found) [insight, sourceRef, ideaId] = [found.text, found.source, found.id];
  } else if (post) {
    const p = await studio.post(post).catch(() => null);
    if (p) [insight, sourceRef] = [[p.seed, p.linkedin].filter(Boolean).join("\n\n"), p.source];
  } else if (from) {
    const c = await admin.get(from).catch(() => null);
    if (c) [insight, sourceRef] = [c.seo.tldr || c.excerpt || c.title, { content_id: c.id, kind: c.kind, title: c.title, path: pathFor(c) }];
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 960 }}>
      <div>
        <Link href="/studio/write" style={{ fontSize: 14, color: "var(--muted)" }}>
          ← Write
        </Link>
        <h1 className="display" style={{ fontSize: 40, marginTop: 8 }}>
          New article
        </h1>
      </div>
      <ArticleStart insight={insight.slice(0, 3000)} sourceRef={sourceRef} ideaId={ideaId} />
    </div>
  );
}
