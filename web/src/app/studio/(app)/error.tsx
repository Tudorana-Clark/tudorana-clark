"use client";

export default function StudioError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" style={{ background: "var(--white)", borderRadius: 24, padding: 32, display: "flex", flexDirection: "column", gap: 12 }}>
      <h1 className="display" style={{ fontSize: 28 }}>
        The studio hit a problem
      </h1>
      <p style={{ margin: 0, color: "var(--muted)" }}>Nothing you saved has been lost. Try again in a moment.{error.digest ? ` Reference: ${error.digest}` : ""}</p>
      <button type="button" className="pill sm" onClick={reset} style={{ alignSelf: "flex-start" }}>
        Try again
      </button>
    </div>
  );
}
