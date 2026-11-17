"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({ msg: "page_error", digest: error.digest, error: error.message }));
  }, [error]);

  return (
    <section className="wrap" style={{ paddingTop: 120, paddingBottom: 40, display: "flex", flexDirection: "column", gap: 20, maxWidth: 720 }}>
      <span className="eyebrow">Something went wrong</span>
      <h1 className="display h-1" style={{ fontSize: 56, lineHeight: 1.02 }}>
        This page didn’t load.
      </h1>
      <p style={{ margin: 0, fontSize: 18, lineHeight: 1.6, color: "var(--muted)" }}>It’s usually a brief connection issue. Try again, or head back to the home page.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="pill" onClick={reset}>
          Try again
        </button>
        <Link className="pill ghost" href="/">
          Go to the home page
        </Link>
      </div>
      {error.digest && <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>Reference: {error.digest}</p>}
    </section>
  );
}
