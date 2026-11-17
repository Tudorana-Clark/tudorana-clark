import Link from "next/link";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="wrap" style={{ paddingTop: 120, display: "flex", flexDirection: "column", gap: 20, maxWidth: 720 }}>
        <span className="eyebrow">404</span>
        <h1 className="display h-1" style={{ fontSize: 56, lineHeight: 1.02 }}>
          That page isn’t here.
        </h1>
        <p style={{ margin: 0, fontSize: 18, lineHeight: 1.6, color: "var(--muted)" }}>It may have moved or been unpublished. The latest writing is a good place to start.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="pill" href="/writing">
            Browse writing
          </Link>
          <Link className="pill ghost" href="/">
            Home
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
