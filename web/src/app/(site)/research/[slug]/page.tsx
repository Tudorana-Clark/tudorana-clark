import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { Contents } from "@/components/doc/Contents";
import { renderDoc } from "@/components/doc/DocBody";
import { ShareBar } from "@/components/ShareBar";
import { JsonLd, Media } from "@/components/ui";
import { getPublished } from "@/lib/api";
import { pathFor } from "@/lib/content";
import { docGraphExtras, parseDocument } from "@/lib/doc-blocks";
import { contentGraph } from "@/lib/jsonld";
import { contentMetadata } from "@/lib/page-meta";
import { absoluteUrl } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const c = await getPublished(slug);
  if (!c) notFound();
  if (c.kind !== "research") permanentRedirect(pathFor(c));
  return c;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await load((await params).slug);
  const meta = contentMetadata(c);
  // Google Scholar & AI crawlers read Highwire tags to index papers.
  meta.other = {
    ...meta.other,
    citation_title: c.title,
    citation_author: "Tudorana-Clark, Daniel",
    ...(c.published_at ? { citation_publication_date: c.published_at.slice(0, 10).replaceAll("-", "/") } : {}),
    ...(c.research?.institution ? { citation_dissertation_institution: c.research.institution } : {}),
    ...(c.research?.pdf_url ? { citation_pdf_url: c.research.pdf_url } : {}),
  };
  return meta;
}

export default async function ResearchPaper({ params }: Props) {
  const c = await load((await params).slug);
  const r = c.research;
  const segments = parseDocument(c.body);
  const { nodes, headings } = renderDoc(segments);
  const chapters = headings.filter((h) => h.depth === 2);
  // A long paper reads as chapters with a contents list; a short one keeps the abstract layout.
  const longRead = chapters.length >= 3;
  const url = absoluteUrl(pathFor(c));

  return (
    <article>
      <JsonLd data={contentGraph(c, { name: "Research", path: "/research" }, docGraphExtras(segments, url))} />
      <section className="wrap hero-top" style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 980, marginLeft: "auto", marginRight: "auto" }}>
        <span className="eyebrow">{["Research", r?.institution, c.category].filter(Boolean).join(" · ")}</span>
        <h1 className="display h-hero" style={{ fontSize: 68, lineHeight: 1.02 }}>
          {c.title}
        </h1>
        {c.subtitle && <p style={{ margin: 0, fontSize: 22, lineHeight: 1.45, color: "var(--muted)" }}>{c.subtitle}</p>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
          {r?.pdf_url && (
            <a className="pill" href={r.pdf_url} target="_blank" rel="noopener">
              Download the paper (PDF)
            </a>
          )}
          {r?.carousel_url && (
            <a className="pill ghost" href={r.carousel_url} target="_blank" rel="noopener">
              View the carousel
            </a>
          )}
        </div>
      </section>

      {!longRead && (
      <section className="wrap" style={{ marginTop: 80 }}>
        <div className="split">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <span className="eyebrow">Abstract</span>
            {c.seo.tldr && (
              <h2 className="display" style={{ fontSize: 36, lineHeight: 1.1 }}>
                {c.excerpt || c.seo.tldr}
              </h2>
            )}
          </div>
          <div className="doc-short" >
            {nodes}
          </div>
        </div>
      </section>
      )}

      {c.seo.key_takeaways.length > 0 && (
        <section className="wrap gap-top">
          <div className="dark-panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <span style={{ fontSize: 13, color: "var(--gold)" }}>In short</span>
            {c.seo.tldr && (
              <p className="display tldr-lead">
                {c.seo.tldr}
              </p>
            )}
            <ul className="g3" style={{ listStyle: "none", padding: 0, margin: "16px 0 0" }}>
              {c.seo.key_takeaways.map((k) => (
                <li key={k} style={{ background: "var(--navy-2)", borderRadius: 20, padding: 26, fontSize: 15, lineHeight: 1.55, color: "var(--on-dark-3)" }}>
                  {k}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {longRead && (
        <section className="wrap doc-layout" aria-label="Paper">
          <aside className="doc-aside">
            <Contents headings={chapters} variant="aside" />
          </aside>
          <div className="doc-main">
            <Contents headings={chapters} variant="inline" />
            {nodes}
          </div>
        </section>
      )}

      {(r?.pdf_url || c.feature_image) && (
        <section className="wrap gap-top">
          <div className="g2">
            {r?.pdf_url && (
              <div className="card-xl" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 500 }}>Research paper</div>
                    <div style={{ fontSize: 20, color: "var(--muted)" }}>PDF</div>
                  </div>
                  <a className="pill sm" href={r.pdf_url} target="_blank" rel="noopener">
                    Download
                  </a>
                </div>
                <Media image={c.feature_image} fallback={c.slug} tone="dark" style={{ height: 360, borderRadius: 18 }} />
              </div>
            )}
            {r?.carousel_url && (
              <div className="card-xl" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 500 }}>The explainer</div>
                    <div style={{ fontSize: 20, color: "var(--muted)" }}>Carousel</div>
                  </div>
                  <a className="pill sm" href={r.carousel_url} target="_blank" rel="noopener">
                    View
                  </a>
                </div>
                <Media tone="dark" style={{ height: 360, borderRadius: 18 }} />
              </div>
            )}
          </div>
        </section>
      )}

      {r?.citation && (
        <section className="wrap gap-top" style={{ maxWidth: 820, marginLeft: "auto", marginRight: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 className="display" style={{ fontSize: 28 }}>
            Cite this work
          </h2>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "var(--muted)", background: "var(--card)", borderRadius: 18, padding: 22 }}>{r.citation}</p>
        </section>
      )}

      <section className="wrap" style={{ marginTop: 48, maxWidth: 820, marginLeft: "auto", marginRight: "auto" }}>
        <ShareBar url={absoluteUrl(pathFor(c))} title={c.title} social={c.social} />
      </section>
    </article>
  );
}
