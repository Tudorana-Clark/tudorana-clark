"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({ msg: "global_error", digest: error.digest, error: error.message }));
  }, [error]);

  return (
    <html lang="en-GB">
      <body style={{ margin: 0, fontFamily: "Inter, system-ui, sans-serif", color: "#0E1520", background: "#fff" }}>
        <main style={{ maxWidth: 640, margin: "120px auto", padding: "0 16px", display: "flex", flexDirection: "column", gap: 16 }}>
          <h1 style={{ fontSize: 40, letterSpacing: "-0.03em", margin: 0 }}>The site hit a problem.</h1>
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: "#5E636B" }}>Please try again. If it keeps happening, come back in a few minutes.</p>
          <button type="button" onClick={reset} style={{ alignSelf: "flex-start", minHeight: 44, padding: "0 20px", borderRadius: 999, border: 0, background: "#0E1520", color: "#fff", fontSize: 15, cursor: "pointer" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
