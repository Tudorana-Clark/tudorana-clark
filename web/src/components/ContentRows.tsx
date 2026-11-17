import Link from "next/link";

import { displayDate, formatPadded, formatShort, KIND_LABEL, pathFor } from "@/lib/content";
import type { ContentSummary } from "@/lib/types";

import { ArrowIcon, Media, PlayIcon } from "./ui";

/** Home-page "Latest writing" list item. */
export function LatestRow({ item }: { item: ContentSummary }) {
  return (
    <Link href={pathFor(item)} className="list-link">
      <span style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          {[item.category || KIND_LABEL[item.kind], formatShort(item.published_at)].filter(Boolean).join(" · ")}
        </span>
        <span className="display" style={{ fontSize: 24, lineHeight: 1.2, transition: "color 160ms" }}>
          {item.title}
        </span>
        {item.excerpt && <span style={{ fontSize: 15, lineHeight: 1.55, color: "var(--muted)" }}>{item.excerpt}</span>}
      </span>
      <ArrowIcon />
    </Link>
  );
}

/** Speaking list row: date · event · Read. */
export function TalkRow({ item }: { item: ContentSummary }) {
  return (
    <div className="row">
      <span style={{ fontSize: 14, color: "var(--muted)" }}>{formatPadded(displayDate(item))}</span>
      <span className="display" style={{ fontSize: 22 }}>
        {item.event?.name || item.title}
      </span>
      <Link className="pill ghost sm" href={pathFor(item)} aria-label={`Read about ${item.event?.name || item.title}`}>
        Read
      </Link>
    </div>
  );
}

export function VideoCard({ item }: { item: ContentSummary }) {
  const thumb = item.video?.thumbnail ?? item.feature_image;
  return (
    <Link href={pathFor(item)} style={{ display: "flex", flexDirection: "column", gap: 14, color: "var(--ink)" }}>
      <Media image={thumb} fallback={item.slug} style={{ aspectRatio: "16 / 10", display: "flex", alignItems: "center", justifyContent: "center" }} sizes="(max-width: 860px) 100vw, 400px">
        <span className="play" style={{ position: "relative" }}>
          <PlayIcon />
        </span>
      </Media>
      <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>{item.event?.name || item.category || "Video"}</span>
        <span className="display" style={{ fontSize: 20 }}>
          {item.title}
        </span>
      </span>
    </Link>
  );
}
