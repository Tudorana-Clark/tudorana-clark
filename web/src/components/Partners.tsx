import { site } from "@/lib/site";

export function Partners() {
  return (
    <section className="wrap section-sm" style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 18, alignItems: "center" }}>
      <span className="eyebrow">Go-to-market partner work with</span>
      <ul className="display" style={{ display: "flex", gap: "16px 56px", flexWrap: "wrap", justifyContent: "center", listStyle: "none", margin: 0, padding: 0 }}>
        {site.partners.map((p) => (
          <li key={p} style={{ fontSize: 26, color: "var(--muted-2)" }}>
            {p}
          </li>
        ))}
      </ul>
    </section>
  );
}
