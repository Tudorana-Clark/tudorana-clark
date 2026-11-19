import type { Metadata } from "next";
import Link from "next/link";

import { ContactForm } from "@/components/ContactForm";
import { Partners } from "@/components/Partners";
import { JsonLd, Media } from "@/components/ui";
import { breadcrumbs, personNode } from "@/lib/jsonld";
import { absoluteUrl, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "About Daniel Tudorana-Clark",
  description: "Daniel Tudorana-Clark is Director of AI at Hello AI Collective, formerly Senior Director of Application Development and AI at Monster Energy. Book Daniel for speaking or advisory.",
  alternates: { canonical: "/about" },
  openGraph: { url: "/about", type: "profile" },
};

const CAREER = [
  ["Early career", "Left college to start a freelance business building websites, apps and marketing campaigns for UK brands."],
  ["Six years", "Drove growth and value in the hospitality sector across EMEA."],
  ["Eleven years, Monster Energy", "For the final five, Senior Director of Application Development and AI across Europe, the Middle East, Africa and Oceania."],
  ["Today", "Director of AI at Hello AI Collective, helping businesses of every size put AI to practical use."],
] as const;

const NOW = [
  ["Now", "Director of AI, Hello AI Collective", "Helping businesses of every size put AI to practical use."],
  ["Before", "Monster Energy, eleven years", "Senior Director of Application Development and AI across EMEA and Oceania."],
  ["Study", "MSc Computer Science with Software Engineering", "University of Hertfordshire, 2026."],
] as const;

export default function AboutPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            breadcrumbs([{ name: "Home", path: "/" }, { name: "About", path: "/about" }]),
            { "@type": "ProfilePage", url: absoluteUrl("/about"), mainEntity: { "@id": personNode()["@id"] } },
            { ...personNode(), description: "Director of AI at Hello AI Collective. A career in technology, brand and culture.", image: site.images.portrait ?? undefined },
          ],
        }}
      />
      <section className="wrap" style={{ paddingTop: 88 }}>
        <div className="split" style={{ alignItems: "end" }}>
          <Media image={site.images.portrait ? { url: site.images.portrait, alt: `Portrait of ${site.author}` } : null} tone="warm" focus="50% 28%" priority style={{ aspectRatio: "4 / 5", borderRadius: 28 }} sizes="(max-width: 860px) 100vw, 500px" />
          <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 8 }}>
            <span className="eyebrow">About</span>
            <h1 className="display h-hero" style={{ fontSize: 72, lineHeight: 0.98 }}>
              {site.author}
            </h1>
            <p style={{ margin: 0, fontSize: 21, lineHeight: 1.5 }}>Director of AI at Hello AI Collective. A career in technology, brand and culture, focused on practical, people-centred solutions that create value and efficiency for businesses.</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a className="pill" href="#contact">
                Get in touch
              </a>
              <a className="pill ghost" href={site.social.linkedin} rel="me noopener" target="_blank">
                LinkedIn
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="wrap section-sm">
        <div className="g3">
          {NOW.map(([label, title, text]) => (
            <div key={label} className="card" style={{ padding: 30, display: "flex", flexDirection: "column", gap: 10 }}>
              <span className="eyebrow">{label}</span>
              <span className="display" style={{ fontSize: 26, lineHeight: 1.15 }}>
                {title}
              </span>
              <span style={{ fontSize: 15, lineHeight: 1.55, color: "var(--muted)" }}>{text}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap section-sm">
        <div className="split">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <span className="eyebrow">Career</span>
            <h2 className="display h-1" style={{ fontSize: 44, lineHeight: 1.05 }}>
              From freelance builder to Director of AI
            </h2>
          </div>
          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {CAREER.map(([label, text], i) => (
              <li key={label} className="row timeline-row">
                <span style={{ fontSize: 14, color: i === CAREER.length - 1 ? "var(--brass)" : "var(--muted)", fontWeight: 500 }}>{label}</span>
                <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6 }}>{text}</p>
              </li>
            ))}
            <li aria-hidden="true" style={{ borderTop: "1px solid var(--line)" }} />
          </ol>
        </div>
      </section>

      <section className="wrap section-sm" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <h2 className="display h-1" style={{ fontSize: 44 }}>
          What I write about
        </h2>
        <p style={{ margin: 0, fontSize: 19, lineHeight: 1.6, color: "var(--muted)", maxWidth: 760 }}>How technology can drive social and economic growth when it is deployed well, drawing on consulting work and enterprise technology experience.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {site.topics.map((t) => (
            <Link key={t} className="pill ghost sm" href="/writing">
              {t}
            </Link>
          ))}
        </div>
      </section>

      <Partners />

      <section id="contact" className="wrap section-sm" style={{ scrollMarginTop: 24 }}>
        <div className="split card-xl pad-sm" style={{ padding: 56 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <span className="eyebrow">Contact</span>
            <h2 className="display h-1" style={{ fontSize: 44, lineHeight: 1.05 }}>
              Let’s talk
            </h2>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: "var(--muted)" }}>Speaking, advisory, media or a question about something I wrote.</p>
          </div>
          <ContactForm />
        </div>
      </section>
    </>
  );
}
