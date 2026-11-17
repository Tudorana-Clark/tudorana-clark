"use client";

import Link from "next/link";
import { useState } from "react";

import type { ContentSummary, Kind } from "@/lib/types";

import { ArrowIcon } from "./ui";

export interface WritingItem {
  id: string;
  kind: Kind;
  href: string;
  date: string;
  tag: string;
  title: string;
}

const FILTERS: { key: "all" | Kind; label: string }[] = [
  { key: "all", label: "All" },
  { key: "article", label: "Articles" },
  { key: "research", label: "Research" },
  { key: "note", label: "Notes" },
];

export function WritingList({ items }: { items: WritingItem[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const shown = filter === "all" ? items : items.filter((i) => i.kind === filter);

  return (
    <>
      <div role="group" aria-label="Filter writing" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 48 }}>
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className="chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>
      <section style={{ marginTop: 32 }} aria-live="polite">
        <p className="sr-only">
          Showing {shown.length} {shown.length === 1 ? "item" : "items"}
        </p>
        {shown.map((it) => (
          <Link key={it.id} href={it.href} className="list-link stack-sm" style={{ gridTemplateColumns: "140px minmax(0,1fr) auto", alignItems: "center", padding: "28px 0" }}>
            <span style={{ fontSize: 14, color: "var(--muted)" }}>{it.date}</span>
            <span style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="kicker">{it.tag}</span>
              <span className="display" style={{ fontSize: 26, lineHeight: 1.2, transition: "color 160ms" }}>
                {it.title}
              </span>
            </span>
            <span className="hide-sm">
              <ArrowIcon />
            </span>
          </Link>
        ))}
        {shown.length === 0 && <p style={{ padding: "28px 0", margin: 0, color: "var(--muted)", borderTop: "1px solid var(--line)" }}>Nothing here yet. Try another filter.</p>}
        <div style={{ borderTop: "1px solid var(--line)" }} />
      </section>
    </>
  );
}

export type { ContentSummary };
