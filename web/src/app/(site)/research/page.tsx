import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { ContactForm } from "@/components/ContactForm";
import { EmptyState, JsonLd, Notice } from "@/components/ui";
import { listPublishedSafe } from "@/lib/api";
import { formatShort, pathFor } from "@/lib/content";
import { PERSON_ID, breadcrumbs, personNode } from "@/lib/jsonld";
import { involvement, programme, stages } from "@/lib/research-programme";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Research",
  description: `${programme.question} Daniel Tudorana-Clark's research on calibrated reliance and human oversight in AI-assisted professional work.`,
  alternates: { canonical: "/research" },
  openGraph: { url: "/research" },
};

export default async function ResearchIndex() {
  await connection();
  const { items, failed } = await listPublishedSafe("research", 50);
  const url = absoluteUrl("/research");

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbs([
        { name: "Home", path: "/" },
        { name: "Research", path: "/research" },
      ]),
      {
        "@type": "ResearchProject",
        "@id": `${url}#programme`,
        name: programme.name,
        description: `${programme.question} ${programme.summary}`,
        url,
        founder: { "@id": PERSON_ID },
        member: { "@id": PERSON_ID },
      },
      {
        "@type": "CollectionPage",
        "@id": `${url}#page`,
        url,
        name: "Research",
        about: { "@id": `${url}#programme` },
        hasPart: items.map((r) => ({ "@type": "ScholarlyArticle", name: r.title, url: absoluteUrl(pathFor(r)) })),
      },
      personNode(),
    ],
  };

  return (
    <div className="wrap">
      <JsonLd data={graph} />

      <section className="hero-top" style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 880 }}>
        <span className="eyebrow">Research · {programme.name}</span>
        <h1 className="display h-hero" style={{ fontSize: 64, lineHeight: 1.02 }}>
          {programme.question}
        </h1>
        <p style={{ margin: 0, fontSize: 19, lineHeight: 1.55, color: "var(--muted)", maxWidth: 760 }}>{programme.summary}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <Link className="pill" href={programme.instrumentPath}>
            Try the instrument
          </Link>
          <a className="pill ghost" href="#get-involved">
            Get involved
          </a>
        </div>
      </section>

      <section aria-labelledby="published" className="section-sm" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h2 id="published" className="eyebrow" style={{ margin: 0, fontWeight: 400 }}>
          Published work
        </h2>
        {failed && <Notice>Research couldn’t load just now. Refresh in a moment.</Notice>}
        {!failed && items.length === 0 && <EmptyState title="Research is on its way">The first paper will appear here as soon as it’s published.</EmptyState>}
        {items.map((r) => (
          <Link key={r.id} href={pathFor(r)} className="dark-panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <span style={{ fontSize: 13, color: "var(--gold)" }}>{[r.category, formatShort(r.published_at)].filter(Boolean).join(" · ")}</span>
            <h3 className="display h-2" style={{ margin: 0, fontSize: 44, lineHeight: 1.05, color: "var(--white)" }}>
              {r.title}
            </h3>
            {r.excerpt && <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: "var(--on-dark-2)", maxWidth: 760 }}>{r.excerpt}</p>}
            <span className="pill light" style={{ alignSelf: "flex-start", marginTop: 8 }}>
              Read the paper
            </span>
          </Link>
        ))}
      </section>

      <section aria-labelledby="programme" className="section-sm" style={{ display: "flex", flexDirection: "column", gap: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
          <span className="eyebrow">The programme</span>
          <h2 id="programme" className="display h-1" style={{ margin: 0, fontSize: 48, lineHeight: 1.04 }}>
            Where the research goes next
          </h2>
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: "var(--muted)" }}>
            Version 1.0 shows the idea can be built and tested. What it can&apos;t yet show is whether it reflects good judgement in real work. Each stage below closes part of that gap.
          </p>
        </div>
        <ol className="programme">
          {stages.map((s) => (
            <li key={s.title} data-status={s.status.toLowerCase()}>
              <div className="programme-meta">
                <span className="programme-status">{s.status}</span>
                <span>{s.when}</span>
              </div>
              <h3>{s.href ? <Link href={s.href}>{s.title}</Link> : s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="get-involved" aria-labelledby="get-involved-title" className="section-sm" style={{ scrollMarginTop: 24 }}>
        <div className="split card-xl pad-sm" style={{ padding: 56 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <span className="eyebrow">Research</span>
            <h2 id="get-involved-title" className="display h-1" style={{ margin: 0, fontSize: 44, lineHeight: 1.05 }}>
              {involvement.title}
            </h2>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: "var(--muted)" }}>{involvement.lead}</p>
            <ul className="involve-list">
              {involvement.asks.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
          <ContactForm topic="Research" label="Research enquiry" />
        </div>
      </section>
    </div>
  );
}
