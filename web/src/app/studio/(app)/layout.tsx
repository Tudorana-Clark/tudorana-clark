import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/Logo";

import { logoutAction } from "../actions";

export const metadata: Metadata = { title: "Studio", robots: { index: false, follow: false } };

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--card)" }}>
      <a className="skip-link" href="#studio-main">
        Skip to content
      </a>
      <header style={{ background: "var(--white)", borderBottom: "1px solid var(--line)" }}>
        <nav className="wrap nav" aria-label="Studio" style={{ maxWidth: 1440 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link href="/studio" className="nav-home" aria-label="Studio home">
              <Logo />
            </Link>
            <span style={{ fontSize: 13, color: "var(--brass)", fontWeight: 600, letterSpacing: "0.04em" }}>STUDIO</span>
          </div>
          <div className="links">
            <Link href="/studio">Content</Link>
            <Link href="/studio/inbox">Inbox</Link>
            <a href="/" target="_blank" rel="noopener">
              View site
            </a>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link className="pill sm" href="/studio/new">
              New
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="pill ghost sm">
                Sign out
              </button>
            </form>
          </div>
        </nav>
      </header>
      <main id="studio-main" className="wrap" style={{ maxWidth: 1440, paddingTop: 32, paddingBottom: 80 }}>
        {children}
      </main>
    </div>
  );
}
