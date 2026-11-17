import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { TalkRow, VideoCard } from "@/components/ContentRows";
import { Media, Notice, PlayIcon } from "@/components/ui";
import { listPublishedSafe } from "@/lib/api";
import { pathFor } from "@/lib/content";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Speaking and video",
  description: "Keynotes, panels and business clubs on practical AI adoption with Daniel Tudorana-Clark. Watch talks and book Daniel to speak.",
  alternates: { canonical: "/speaking" },
  openGraph: { url: "/speaking" },
};

export default async function SpeakingPage() {
  await connection();
  const [talks, videos] = await Promise.all([listPublishedSafe("talk", 50), listPublishedSafe("video", 30)]);
  const featured = videos.items.find((v) => v.featured) ?? videos.items[0];
  const rest = videos.items.filter((v) => v.id !== featured?.id).slice(0, 6);

  return (
    <>
      <section className="wrap" style={{ paddingTop: 96, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
        <span className="eyebrow">Speaking and media</span>
        <h1 className="display h-hero" style={{ fontSize: 72, lineHeight: 1.0, maxWidth: 900 }}>
          Talks and appearances
        </h1>
        <p style={{ margin: 0, fontSize: 19, lineHeight: 1.55, color: "var(--muted)", maxWidth: 620 }}>Practical AI adoption for business leaders, from keynote stages to business clubs. Tell me the audience, format and date.</p>
        <Link className="pill" href="/about#contact">
          Email me
        </Link>
      </section>

      <section className="wrap" style={{ marginTop: 64 }}>
        <Media image={site.images.stage ? { url: site.images.stage, alt: `${site.author} speaking on stage at a technology conference` } : null} priority focus="50% 30%" style={{ height: "min(560px, 60vw)", borderRadius: 28 }} sizes="(max-width: 1240px) 100vw, 1176px" />
      </section>

      {(talks.failed || videos.failed) && (
        <div className="wrap" style={{ marginTop: 32 }}>
          <Notice>Some appearances couldn’t load just now. Refresh in a moment.</Notice>
        </div>
      )}

      <section className="wrap" style={{ marginTop: 96 }}>
        <div className="split">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <span className="eyebrow">Appearances</span>
            <h2 className="display h-1" style={{ fontSize: 44, lineHeight: 1.05 }}>
              Recent stages
            </h2>
          </div>
          <div>
            {talks.items.map((t) => (
              <TalkRow key={t.id} item={t} />
            ))}
            {talks.items.length === 0 && !talks.failed && <p style={{ margin: 0, padding: "22px 0", color: "var(--muted)", borderTop: "1px solid var(--line)" }}>Upcoming appearances will be listed here.</p>}
            <div style={{ borderTop: "1px solid var(--line)" }} />
          </div>
        </div>
      </section>

      <section id="video" className="wrap section-sm" style={{ display: "flex", flexDirection: "column", gap: 28, scrollMarginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span className="eyebrow">Video</span>
            <h2 className="display h-1" style={{ fontSize: 44, lineHeight: 1.05 }}>
              Watch
            </h2>
          </div>
          <span style={{ fontSize: 15, color: "var(--muted)" }}>Talks, interviews and short explainers</span>
        </div>
        {featured ? (
          <>
            <div className="stack-sm" style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 16 }}>
              <Link href={pathFor(featured)} aria-label={`Watch ${featured.title}`}>
                <Media image={featured.video?.thumbnail ?? featured.feature_image} tone="dark" style={{ aspectRatio: "16 / 9", borderRadius: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span className="play" style={{ width: 84, height: 84, position: "absolute" }}>
                    <PlayIcon />
                  </span>
                </Media>
              </Link>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, justifyContent: "flex-end" }}>
                <span className="kicker">Featured</span>
                <Link href={pathFor(featured)} className="display" style={{ fontSize: 32, lineHeight: 1.12 }}>
                  {featured.title}
                </Link>
                {featured.excerpt && <span style={{ fontSize: 15, lineHeight: 1.55, color: "var(--muted)" }}>{featured.excerpt}</span>}
                {featured.event?.name && <span style={{ fontSize: 14, color: "var(--muted)" }}>{featured.event.name}</span>}
              </div>
            </div>
            {rest.length > 0 && (
              <div className="g3">
                {rest.map((v) => (
                  <VideoCard key={v.id} item={v} />
                ))}
              </div>
            )}
          </>
        ) : (
          !videos.failed && <p style={{ margin: 0, color: "var(--muted)" }}>Video from recent talks is coming soon.</p>
        )}
      </section>

      <section className="wrap section-sm">
        <div className="card-xl pad-sm" style={{ padding: 56, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 620 }}>
            <h2 className="display h-2" style={{ fontSize: 40, lineHeight: 1.05 }}>
              Booking Daniel
            </h2>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: "var(--muted)" }}>Keynotes, panels, workshops and podcasts. A speaker pack with bio, headshots and topics is available on request.</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link className="pill" href="/about#contact">
              Email me
            </Link>
            <Link className="pill ghost" href="/about#contact">
              Speaker pack
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
