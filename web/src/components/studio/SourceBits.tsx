import { freshness, type LinkStatus } from "@/lib/types";

const FRESH: Record<ReturnType<typeof freshness>, { label: string; bg: string; fg: string }> = {
  fresh: { label: "Fresh", bg: "#E6F2EA", fg: "var(--success)" },
  ageing: { label: "6–12 months old", bg: "#F4ECDD", fg: "var(--brass)" },
  stale: { label: "Over a year old", bg: "#FBE9E4", fg: "var(--danger)" },
  undated: { label: "No date", bg: "var(--card)", fg: "var(--muted)" },
};

const LINK: Record<LinkStatus, { label: string; bg: string; fg: string }> = {
  ok: { label: "Link works", bg: "#E6F2EA", fg: "var(--success)" },
  blocked: { label: "Site refused check", bg: "#F4ECDD", fg: "var(--brass)" },
  broken: { label: "Link broken", bg: "#FBE9E4", fg: "var(--danger)" },
  unchecked: { label: "Link not checked", bg: "var(--card)", fg: "var(--muted)" },
};

function Pill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 999, background: bg, color: fg, whiteSpace: "nowrap" }}>{label}</span>;
}

export function FreshnessPill({ published_on }: { published_on: string | null }) {
  return <Pill {...FRESH[freshness(published_on)]} />;
}

export function LinkPill({ status }: { status: LinkStatus }) {
  return <Pill {...LINK[status]} />;
}

/** "ONS · sponsored by X · July 2026" */
export function sourceByline(s: { publisher: string; sponsor: string; published: string }): string {
  return [s.publisher, s.sponsor ? `sponsored by ${s.sponsor}` : "", s.published || "date unknown"].filter(Boolean).join(" · ");
}
