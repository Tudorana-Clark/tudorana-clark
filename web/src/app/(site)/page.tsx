import Link from "next/link";
import { connection } from "next/server";

import { LatestRow, TalkRow, VideoCard } from "@/components/ContentRows";
import { Partners } from "@/components/Partners";
import { ArrowIcon, Media, Notice, SectionIntro } from "@/components/ui";
import { getPublished, listPublishedSafe } from "@/lib/api";
import { formatShort, leadText, pathFor } from "@/lib/content";
import { site } from "@/lib/site";

const CAREER = [
  { label: "Early career", text: "Left college to start a freelance business building websites, apps and marketing campaigns for UK brands." },
  { label: "Six years", text: "Drove growth and value in the hospitality sector across EMEA." },
  { label: "Eleven years, Monster Energy", text: "For the final five, Senior Director of Application Development and AI across Europe, the Middle East, Africa and Oceania." },
  { label: "Today", text: "Director of AI at Hello AI Collective, helping businesses of every size put AI to practical use.", current: true },
];

const PHILOSOPHY = [
  { n: "01", title: "Growth comes from adopting technology, not inventing it.", text: "Businesses that update their processes to match what the technology can do will grow." },
  { n: "02", title: "When output becomes cheap, ownership becomes the advantage.", text: "Growing businesses will organise around people who own outcomes, not the volume of work produced." },
  { n: "03", title: "A generational skills gap exists.", text: "AI is changing the skills needed to drive transformation, rather than replacing those skills." },
];

export default async function HomePage() {
  await connection();
  const [articles, research, talks, videos] = await Promise.all([
    listPublishedSafe("article", 3),
    listPublishedSafe("research", 1),
    listPublishedSafe("talk", 4),
    listPublishedSafe("video", 3),
  ]);
  const latest = articles.items[0];
  const latestFull = latest ? await getPublished(latest.slug).catch(() => null) : null;
  const latestLead = (latestFull && leadText(latestFull.body)) || latest?.excerpt || "";
  const paper = research.items[0];
  const anyFailed = [articles, research, talks, videos].some((r) => r.failed);

  return (
    <>
      <section className="wrap" style={{ paddingTop: 96, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
        <h1 className="display h-hero" style={{ fontSize: 76, lineHeight: 1.0, maxWidth: 980 }}>
          Insights on AI, technology, business and the economy.
        </h1>
        <p style={{ margin: 0, fontSize: 19, lineHeight: 1.55, color: "var(--muted)", maxWidth: 640 }}>
          I help businesses put AI to practical use, and write about how technology drives social and economic growth when it is deployed well.
        </p>
      </section>

      {anyFailed && (
        <div className="wrap" style={{ marginTop: 32 }}>
          <Notice>Some recent content couldn’t load just now. Refresh in a moment to see everything.</Notice>
        </div>
      )}

      <section className="wrap" style={{ marginTop: 72 }}>
        <div className="g2">
          <Link href={latest ? pathFor(latest) : "/writing"} className="card-xl" style={{ display: "flex", flexDirection: "column", gap: 28, color: "var(--ink)", minHeight: 560 }}>
            <CardHead title="Writing" subtitle="Articles, research and notes" />
            <div style={{ flex: 1, minHeight: 380, background: "var(--white)", borderRadius: 20, padding: 32, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 1px 2px rgba(14,21,32,0.06)" }}>
              {latest ? (
                <>
                  <span className="kicker">Latest · {formatShort(latest.published_at)}</span>
                  <span className="display" style={{ fontSize: 36, lineHeight: 1.08 }}>
                    {latest.title}
                  </span>
                  <span style={{ fontSize: 16, lineHeight: 1.65, color: "var(--muted)", marginTop: 4 }}>{latestLead}</span>
                  <span style={{ marginTop: "auto", paddingTop: 12, fontSize: 14, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 8 }}>
                    Read the article <ArrowIcon />
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 15, color: "var(--muted)" }}>New writing is on its way.</span>
              )}
            </div>
          </Link>
          <Link href="/about" className="card-xl" style={{ display: "flex", flexDirection: "column", gap: 28, color: "var(--ink)", minHeight: 560 }}>
            <CardHead title={site.author} subtitle="Founder-led, practitioner first" />
            <Media image={site.images.portrait ? { url: site.images.portrait, alt: `Portrait of ${site.author}` } : null} tone="warm" focus="50% 28%" style={{ marginTop: "auto", flex: 1, minHeight: 380 }} sizes="(max-width: 860px) 100vw, 600px" />
          </Link>
        </div>
      </section>

      <section className="wrap section">
        <div className="split">
          <SectionIntro eyebrow="The founder" title="Twenty years of turning technology into growth." action={{ href: "/about", label: "Full profile" }} />
          <div className="g2" style={{ gap: 32 }}>
            {CAREER.map((c) => (
              <div key={c.label} style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 20, borderTop: `1px solid ${c.current ? "var(--ink)" : "var(--line)"}` }}>
                <span style={{ fontSize: 13, color: c.current ? "var(--brass)" : "var(--muted)", fontWeight: 500 }}>{c.label}</span>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="wrap section" style={{ display: "flex", flexDirection: "column", gap: 32 }}>
        <h2 className="display h-1" style={{ fontSize: 48, lineHeight: 1.04 }}>
          My core philosophy
        </h2>
        <div className="g3">
          {PHILOSOPHY.map((p) => (
            <div key={p.n} className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <span style={{ fontSize: 13, color: "var(--brass)", fontWeight: 600 }}>{p.n}</span>
              <h3 className="display" style={{ fontSize: 22, lineHeight: 1.25 }}>
                {p.title}
              </h3>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "var(--muted)" }}>{p.text}</p>
            </div>
          ))}
        </div>
        <blockquote style={{ margin: "24px 0 0", padding: 0, textAlign: "center" }}>
          <p className="display h-2" style={{ fontSize: 34, lineHeight: 1.2, maxWidth: 900, margin: "0 auto" }}>
            “We now possess the technology to drive generational transformation.”
          </p>
          <footer style={{ marginTop: 14, fontSize: 14, color: "var(--muted)" }}>{site.author}</footer>
        </blockquote>
      </section>

      <section className="wrap section">
        <div className="split">
          <SectionIntro eyebrow="Publishing" title="Latest writing" action={{ href: "/writing", label: "All writing" }} />
          <div>
            {articles.items.slice(0, 3).map((a) => (
              <LatestRow key={a.id} item={a} />
            ))}
            {articles.items.length === 0 && <p style={{ color: "var(--muted)", fontSize: 15, padding: "24px 0", margin: 0, borderTop: "1px solid var(--line)" }}>The first articles are being written.</p>}
            <div style={{ borderTop: "1px solid var(--line)" }} />
          </div>
        </div>
      </section>

      {paper && (
        <section className="wrap section">
          <Link href={pathFor(paper)} className="dark-panel stack-sm" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 48 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <span style={{ fontSize: 13, color: "var(--gold)" }}>Research{paper.category ? ` · ${paper.category}` : ""}</span>
              <h2 className="display h-2" style={{ fontSize: 44, lineHeight: 1.05, color: "var(--white)" }}>
                {paper.title}
              </h2>
              <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: "var(--on-dark-2)" }}>{paper.excerpt}</p>
              <span className="pill light" style={{ alignSelf: "flex-start" }}>
                Read the paper
              </span>
            </div>
            <ResearchArguments slug={paper.slug} />
          </Link>
        </section>
      )}

      {talks.items.length > 0 && (
        <section className="wrap section">
          <div className="split">
            <SectionIntro eyebrow="Speaking and media" title="On stage" action={{ href: "/about#contact", label: "Book Daniel to speak", primary: true }}>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "var(--muted)", maxWidth: 360 }}>Keynotes, panels and business clubs on practical AI adoption.</p>
            </SectionIntro>
            <div>
              {talks.items.map((t) => (
                <TalkRow key={t.id} item={t} />
              ))}
              <div style={{ borderTop: "1px solid var(--line)" }} />
            </div>
          </div>
        </section>
      )}

      {videos.items.length > 0 && (
        <section className="wrap section" style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
            <h2 className="display h-1" style={{ fontSize: 48, lineHeight: 1.04 }}>
              Watch
            </h2>
            <Link className="pill ghost sm" href="/speaking#video">
              All video
            </Link>
          </div>
          <div className="g3">
            {videos.items.map((v) => (
              <VideoCard key={v.id} item={v} />
            ))}
          </div>
        </section>
      )}

      <Partners />
    </>
  );
}

function CardHead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 20, color: "var(--muted)" }}>{subtitle}</div>
      </div>
      <span className="pill sm" aria-hidden="true">
        Explore
      </span>
    </div>
  );
}

/** The paper's key arguments as bubbles (from its takeaways), in place of test statistics. */
async function ResearchArguments({ slug }: { slug: string }) {
  const full = await getPublished(slug).catch(() => null);
  const points = full?.seo.key_takeaways.filter(Boolean).slice(0, 3) ?? [];
  if (!points.length) return <div />;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12, justifyContent: "flex-end" }} aria-label="Key arguments">
      {points.map((point) => (
        <li key={point} className="stat-dark" style={{ fontSize: 15, lineHeight: 1.5, color: "var(--on-dark-3)" }}>
          {point}
        </li>
      ))}
    </ul>
  );
}
