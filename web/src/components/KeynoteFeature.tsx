import Link from "next/link";

import { bookingHref, type Keynote } from "@/lib/keynotes";

import { KeynotePoster } from "./KeynotePoster";

/** The pinned keynote: its poster, what it is, and a direct route to book it. */
export function KeynoteFeature({ keynote, secondary }: { keynote: Keynote; secondary?: { href: string; label: string } }) {
  const id = `keynote-${keynote.slug}`;
  return (
    <article className="keynote card-xl" aria-labelledby={id}>
      <div className="keynote-copy">
        <span className="eyebrow">Keynote speech</span>
        <h2 id={id} className="display h-1" style={{ fontSize: 48, lineHeight: 1.04, margin: 0 }}>
          {keynote.title}
        </h2>
        <p className="keynote-subtitle">{keynote.subtitle}</p>
        <p className="keynote-summary">{keynote.summary}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
          <Link className="pill" href={bookingHref(keynote)}>
            Book now
          </Link>
          {secondary && (
            <Link className="pill light" href={secondary.href}>
              {secondary.label}
            </Link>
          )}
        </div>
      </div>
      <KeynotePoster keynote={keynote} />
    </article>
  );
}
