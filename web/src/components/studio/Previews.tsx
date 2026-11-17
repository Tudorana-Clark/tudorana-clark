"use client";

/** How the piece will look in a Google/Bing result and as a shared link card. */
export function SerpPreview({ url, title, description }: { url: string; title: string; description: string }) {
  return (
    <div aria-label="Search result preview" style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 4, fontFamily: "Arial, sans-serif" }}>
      <span style={{ fontSize: 12, color: "#4d5156", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{url}</span>
      <span style={{ fontSize: 18, color: "#1a0dab", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>{title || "Add a title"}</span>
      <span style={{ fontSize: 13, color: "#4d5156", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{description || "Add a meta description — it’s the sentence that wins the click."}</span>
    </div>
  );
}

export function SocialCardPreview({ domain, title, description, image }: { domain: string; title: string; description: string; image: string | null }) {
  return (
    <div aria-label="Link card preview" style={{ border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ aspectRatio: "1200 / 630", background: "var(--card)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Branded card generated on publish</span>
        )}
      </div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 2, background: "#f6f7f8" }}>
        <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase" }}>{domain}</span>
        <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>{title || "Title"}</span>
        <span style={{ fontSize: 13, color: "var(--muted)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>{description}</span>
      </div>
    </div>
  );
}
