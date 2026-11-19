import type { Kind } from "./types";

/** URL scheme. Mirrors public_path() in api/app/service.py. */
const SECTION: Record<Kind, "writing" | "research" | "speaking"> = {
  article: "writing",
  note: "writing",
  research: "research",
  talk: "speaking",
  video: "speaking",
};

export function sectionFor(kind: Kind) {
  return SECTION[kind];
}

/** Writing (articles, notes) lives at the root, /<slug>, as it did on Ghost; other kinds keep their section. */
export function pathFor(item: { kind: Kind; slug: string }): string {
  return SECTION[item.kind] === "writing" ? `/${item.slug}` : `/${SECTION[item.kind]}/${item.slug}`;
}

/**
 * Top-level paths owned by the app. A writing slug can't use these (it would be unreachable).
 * Mirrors RESERVED_SLUGS in api/app/service.py.
 */
export const RESERVED_SLUGS = ["writing", "research", "speaking", "about", "studio", "api", "md", "indexnow", "feed", "rss", "sitemap", "robots", "llms", "llms-full", "og", "opengraph-image", "twitter-image", "icon", "articles", "notes", "contact", "subscribe", "signin", "signup", "tag", "author", "ghost"];

export const KIND_LABEL: Record<Kind, string> = {
  article: "Article",
  research: "Research",
  note: "Note",
  talk: "Talk",
  video: "Video",
};

const longDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
const paddedDate = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/London" });

function safe(fmt: Intl.DateTimeFormat, iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  // en-GB abbreviates September as "Sept"; keep every short month to three letters so dates line up.
  return Number.isNaN(d.getTime()) ? "" : fmt.format(d).replace(/\bSept\b/, "Sep");
}

export const formatLong = (iso: string | null | undefined) => safe(longDate, iso);
export const formatShort = (iso: string | null | undefined) => safe(shortDate, iso);
export const formatPadded = (iso: string | null | undefined) => safe(paddedDate, iso);

/** The date a piece is "about": event date for talks, publish date otherwise. */
export function displayDate(item: { kind: Kind; published_at: string | null; updated_at: string; event?: { date: string } | null }): string | null {
  if ((item.kind === "talk" || item.kind === "video") && item.event?.date) return item.event.date;
  return item.published_at ?? item.updated_at;
}

/**
 * Opening paragraphs of a Markdown body as plain text, cut at a sentence boundary.
 * Uses the author's own words (not the AI summary) for previews.
 */
export function leadText(markdown: string, maxChars = 560): string {
  const paragraphs = markdown
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p && !/^(#|[-*+] |\d+\. |>|\||!\[|```)/.test(p))
    .map((p) =>
      p
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[*_`~]+/g, "")
        .replace(/\s+/g, " "),
    );
  let out = "";
  for (const p of paragraphs) {
    const next = out ? `${out} ${p}` : p;
    if (next.length <= maxChars) {
      out = next;
      continue;
    }
    if (!out) {
      const cut = p.slice(0, maxChars);
      const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
      out = end > 80 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
    }
    break;
  }
  return out;
}
