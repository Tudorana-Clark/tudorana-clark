import Link from "next/link";

import { site } from "@/lib/site";

import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer style={{ background: "var(--card)", marginTop: 120 }}>
      <div className="wrap" style={{ paddingTop: 64, paddingBottom: 40, display: "flex", flexDirection: "column", gap: 48 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 40, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 360 }}>
            <Link href="/" aria-label="Tudorana Clark home" style={{ color: "var(--ink)", alignSelf: "flex-start" }}>
              <Logo />
            </Link>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--muted)" }}>
              Insights on AI, technology, business and the economy. Personal website of {site.author}. Views are my own.
            </p>
          </div>
          <nav aria-label="Footer" style={{ display: "flex", gap: 64, flexWrap: "wrap", fontSize: 14 }}>
            <FooterCol title="Read" links={[["/writing", "Writing"], ["/research", "Research"], ["#newsletter", "Newsletter"], ["/feed.xml", "RSS"]]} />
            <FooterCol title="Watch and listen" links={[["/speaking", "Speaking"], ["/speaking#video", "Video"]]} />
            <FooterCol title="Connect" links={[[site.social.linkedin, "LinkedIn"], [site.social.x, "X"], ["/about#contact", "Contact"]]} />
          </nav>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", fontSize: 13, color: "var(--muted)", borderTop: "1px solid var(--line)", paddingTop: 24 }}>
          <span>© Tudorana Clark</span>
          <span>tudoranaclark.com</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={{ color: "var(--muted)" }}>{title}</span>
      {links.map(([href, label]) =>
        href.startsWith("http") ? (
          <a key={href} href={href} rel="me noopener" target="_blank">
            {label}
          </a>
        ) : (
          <Link key={href} href={href}>
            {label}
          </Link>
        ),
      )}
    </div>
  );
}
