export default function StudioLoading() {
  return (
    <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <span className="sr-only">Loading…</span>
      <div className="skeleton" style={{ height: 44, width: 280 }} />
      <div className="skeleton" style={{ height: 56, width: "60%" }} />
      <div className="skeleton" style={{ height: 420, borderRadius: 20 }} />
    </div>
  );
}
