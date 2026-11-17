import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { EmptyState, Notice } from "@/components/ui";
import { listPublishedSafe } from "@/lib/api";
import { formatShort, pathFor } from "@/lib/content";

export const metadata: Metadata = {
  title: "Research",
  description: "Research by Daniel Tudorana-Clark on AI oversight, calibrated reliance and AI-assisted professional work.",
  alternates: { canonical: "/research" },
  openGraph: { url: "/research" },
};

export default async function ResearchIndex() {
  await connection();
  const { items, failed } = await listPublishedSafe("research", 50);
  return (
    <div className="wrap">
      <section style={{ paddingTop: 96, display: "flex", flexDirection: "column", gap: 22, maxWidth: 820 }}>
        <span className="eyebrow">Research</span>
        <h1 className="display h-hero" style={{ fontSize: 72, lineHeight: 1.0 }}>
          Research
        </h1>
        <p style={{ margin: 0, fontSize: 19, lineHeight: 1.55, color: "var(--muted)" }}>Papers, instruments and explainers on how people and organisations rely on AI.</p>
      </section>
      <div style={{ marginTop: 56, display: "flex", flexDirection: "column", gap: 16 }}>
        {failed && <Notice>Research couldn’t load just now. Refresh in a moment.</Notice>}
        {!failed && items.length === 0 && <EmptyState title="Research is on its way">The first paper will appear here as soon as it’s published.</EmptyState>}
        {items.map((r) => (
          <Link key={r.id} href={pathFor(r)} className="dark-panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <span style={{ fontSize: 13, color: "var(--gold)" }}>
              {[r.category, formatShort(r.published_at)].filter(Boolean).join(" · ")}
            </span>
            <h2 className="display h-2" style={{ fontSize: 44, lineHeight: 1.05, color: "var(--white)" }}>
              {r.title}
            </h2>
            {r.excerpt && <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: "var(--on-dark-2)", maxWidth: 760 }}>{r.excerpt}</p>}
            <span className="pill light" style={{ alignSelf: "flex-start", marginTop: 8 }}>
              Read the paper
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
