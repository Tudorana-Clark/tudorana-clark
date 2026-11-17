export function StatusBadge({ status }: { status: "draft" | "published" }) {
  const live = status === "published";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, padding: "4px 10px", borderRadius: 999, background: live ? "#E6F2EA" : "var(--card)", color: live ? "var(--success)" : "var(--muted)" }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: "currentColor" }} />
      {live ? "Live" : "Draft"}
    </span>
  );
}
