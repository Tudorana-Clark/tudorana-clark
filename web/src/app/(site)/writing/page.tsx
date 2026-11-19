import type { Metadata } from "next";
import { connection } from "next/server";

import { Notice, JsonLd } from "@/components/ui";
import { type WritingItem, WritingList } from "@/components/WritingList";
import { listPublishedSafe } from "@/lib/api";
import { formatShort, pathFor } from "@/lib/content";
import { breadcrumbs } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Writing",
  description: "Articles, research and short notes on AI, technology, business and the economy by Daniel Tudorana-Clark.",
  alternates: { canonical: "/writing" },
  openGraph: { url: "/writing" },
};

export default async function WritingPage() {
  await connection();
  const [articles, research, notes] = await Promise.all([listPublishedSafe("article", 100), listPublishedSafe("research", 50), listPublishedSafe("note", 50)]);
  const all = [...articles.items, ...research.items, ...notes.items].sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
  const items: WritingItem[] = all.map((c) => ({
    id: c.id,
    kind: c.kind,
    href: pathFor(c),
    date: formatShort(c.published_at),
    tag: c.kind === "research" ? `Research${c.category ? ` · ${c.category}` : ""}` : c.kind === "note" ? "Note" : c.category || "Article",
    title: c.title,
  }));

  return (
    <div className="wrap">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            breadcrumbs([{ name: "Home", path: "/" }, { name: "Writing", path: "/writing" }]),
            { "@type": "CollectionPage", name: "Writing", url: absoluteUrl("/writing"), hasPart: all.slice(0, 30).map((c) => ({ "@type": "CreativeWork", headline: c.title, url: absoluteUrl(pathFor(c)), datePublished: c.published_at })) },
          ],
        }}
      />
      <section className="hero-top" style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 820 }}>
        <span className="eyebrow">Publishing</span>
        <h1 className="display h-hero" style={{ fontSize: 72, lineHeight: 1.0 }}>
          Writing
        </h1>
        <p style={{ margin: 0, fontSize: 19, lineHeight: 1.55, color: "var(--muted)" }}>Articles, research and short notes on AI, technology, business and the economy.</p>
      </section>
      {(articles.failed || research.failed || notes.failed) && (
        <div style={{ marginTop: 32 }}>
          <Notice>Some writing couldn’t load just now. Refresh in a moment to see everything.</Notice>
        </div>
      )}
      <WritingList items={items} />
    </div>
  );
}
