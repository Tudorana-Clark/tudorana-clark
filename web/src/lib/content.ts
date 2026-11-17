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

export function pathFor(item: { kind: Kind; slug: string }): string {
  return `/${SECTION[item.kind]}/${item.slug}`;
}

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
  return Number.isNaN(d.getTime()) ? "" : fmt.format(d);
}

export const formatLong = (iso: string | null | undefined) => safe(longDate, iso);
export const formatShort = (iso: string | null | undefined) => safe(shortDate, iso);
export const formatPadded = (iso: string | null | undefined) => safe(paddedDate, iso);

/** The date a piece is "about": event date for talks, publish date otherwise. */
export function displayDate(item: { kind: Kind; published_at: string | null; updated_at: string; event?: { date: string } | null }): string | null {
  if ((item.kind === "talk" || item.kind === "video") && item.event?.date) return item.event.date;
  return item.published_at ?? item.updated_at;
}
