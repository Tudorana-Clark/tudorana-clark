import Link from "next/link";

import { connectionSafeList } from "@/lib/related";
import { formatLong, KIND_LABEL, pathFor, sectionFor } from "@/lib/content";
import { contentGraph } from "@/lib/jsonld";
import { renderMarkdown } from "@/lib/markdown";
import { absoluteUrl, site } from "@/lib/site";
import type { Content } from "@/lib/types";

import { ShareBar } from "./ShareBar";
import { JsonLd, Media } from "./ui";

const SECTION_NAME = { writing: "Writing", research: "Research", speaking: "Speaking" } as const;

/** Shared long-form template for articles, notes, talks and videos (design: "Article"). */
export async function ContentArticle({ content: c }: { content: Content }) {
  const section = sectionFor(c.kind);
  const { html } = renderMarkdown(c.body);
  const related = (await connectionSafeList(c)).slice(0, 2);
  const url = absoluteUrl(pathFor(c));
  const kicker = c.kind === "talk" ? c.event?.name || "Talk" : c.category || KIND_LABEL[c.kind];
  const byline = [site.author, formatLong(c.kind === "talk" && c.event ? c.event.date : c.published_at)].filter(Boolean).join(" · ");

  return (
    <article>
      <JsonLd data={contentGraph(c, { name: SECTION_NAME[section], path: `/${section}` })} />
      <header className="wrap" style={{ paddingTop: 88, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 22 }}>
        <nav aria-label="Breadcrumb" className="sr-only">
          <Link href="/">Home</Link> / <Link href={`/${section}`}>{SECTION_NAME[section]}</Link>
        </nav>
        <Link href={`/${section}`} style={{ fontSize: 13, color: "var(--brass)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {kicker}
        </Link>
        <h1 className="display h-hero" style={{ fontSize: 68, lineHeight: 1.02, maxWidth: 960 }}>
          {c.title}
        </h1>
        {c.subtitle && <p style={{ margin: 0, fontSize: 21, lineHeight: 1.45, color: "var(--muted)", maxWidth: 760 }}>{c.subtitle}</p>}
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, color: "var(--muted)", flexWrap: "wrap", justifyContent: "center" }}>
          <span className="avatar" style={{ width: 32, height: 32 }} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {site.images.portrait && <img src={site.images.portrait} alt="" />}
          </span>
          <span>
            {byline}
            {c.published_at && <time dateTime={c.published_at} hidden />}
          </span>
        </div>
      </header>

      {c.kind === "video" && c.video ? (
        <div className="wrap" style={{ marginTop: 56 }}>
          <div style={{ aspectRatio: "16 / 9", borderRadius: 28, overflow: "hidden", background: "var(--navy-2)" }}>
            <iframe src={c.video.embed_url} title={c.title} style={{ width: "100%", height: "100%", border: 0 }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
          </div>
        </div>
      ) : (
        c.feature_image && (
          <div className="wrap" style={{ marginTop: 56 }}>
            <Media image={c.feature_image} priority style={{ aspectRatio: "16 / 9", borderRadius: 28 }} sizes="(max-width: 1240px) 100vw, 1176px" />
          </div>
        )
      )}

      {(c.seo.tldr || c.seo.key_takeaways.length > 0) && (
        <aside className="summary" aria-labelledby="summary-h">
          <div className="summary-box">
            <h2 id="summary-h" className="kicker" style={{ margin: 0 }}>
              In short
            </h2>
            {c.seo.tldr && <p style={{ margin: 0, fontSize: 18, lineHeight: 1.6 }}>{c.seo.tldr}</p>}
            {c.seo.key_takeaways.length > 0 && (
              <ul>
                {c.seo.key_takeaways.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      )}

      <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />

      {c.seo.faq.length > 0 && (
        <section className="prose faq" aria-labelledby="faq-h" style={{ marginTop: 48 }}>
          <h2 id="faq-h" style={{ marginBottom: 16 }}>
            Questions people ask
          </h2>
          {c.seo.faq.map((f) => (
            <details key={f.question}>
              <summary>{f.question}</summary>
              <p>{f.answer}</p>
            </details>
          ))}
        </section>
      )}

      <footer style={{ maxWidth: 680, margin: "64px auto 0", padding: "0 16px" }}>
        <div className="card" style={{ padding: 28, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          <span className="avatar" style={{ width: 64, height: 64 }} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {site.images.portrait && <img src={site.images.portrait} alt="" />}
          </span>
          <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontWeight: 600 }}>
              {site.author}
            </span>
            <span style={{ fontSize: 14, color: "var(--muted)" }}>
              {site.jobTitle} at {site.employer}. Writes about how technology drives social and economic growth.
            </span>
          </div>
          <Link className="pill sm" href="/about">
            About
          </Link>
        </div>
        <div style={{ marginTop: 20 }}>
          <ShareBar url={url} title={c.title} social={c.social} />
        </div>
        {c.tags.length > 0 && (
          <ul aria-label="Topics" style={{ display: "flex", gap: 8, flexWrap: "wrap", listStyle: "none", padding: 0, margin: "20px 0 0" }}>
            {c.tags.map((t) => (
              <li key={t} style={{ fontSize: 13, color: "var(--muted)", border: "1px solid var(--line)", borderRadius: 999, padding: "6px 12px" }}>
                {t}
              </li>
            ))}
          </ul>
        )}
      </footer>

      {related.length > 0 && (
        <section className="wrap section-sm" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <h2 className="display" style={{ fontSize: 36 }}>
            Keep reading
          </h2>
          <div className="g2">
            {related.map((r) =>
              r.kind === "research" ? (
                <Link key={r.id} href={pathFor(r)} className="dark-panel" style={{ borderRadius: 24, padding: 32, display: "flex", flexDirection: "column", gap: 10, minHeight: 220 }}>
                  <span style={{ fontSize: 13, color: "var(--gold)" }}>Research paper</span>
                  <span className="display" style={{ fontSize: 26, lineHeight: 1.2, marginTop: "auto", color: "var(--white)" }}>
                    {r.title}
                  </span>
                </Link>
              ) : (
                <Link key={r.id} href={pathFor(r)} className="card" style={{ display: "flex", flexDirection: "column", gap: 10, color: "var(--ink)", minHeight: 220 }}>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>
                    {formatLong(r.published_at)}
                  </span>
                  <span className="display" style={{ fontSize: 26, lineHeight: 1.2, marginTop: "auto" }}>
                    {r.title}
                  </span>
                </Link>
              ),
            )}
          </div>
        </section>
      )}
    </article>
  );
}
