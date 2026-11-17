import Link from "next/link";
import type { ReactNode } from "react";

import { serializeJsonLd } from "@/lib/jsonld";

import { CoverArt } from "./CoverArt";
import type { Image as Img } from "@/lib/types";

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}

export function ArrowIcon() {
  return (
    <svg className="arrow" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3 11L11 3M5 3h6v6" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <path d="M7 4.5l11 6.5-11 6.5z" fill="currentColor" />
    </svg>
  );
}

/**
 * Media slot. Renders the image when one exists; otherwise generated cover art (when a `fallback` seed is given)
 * or the design's neutral tile. Both fallbacks are decorative and hidden from assistive tech.
 */
export function Media({
  image,
  style,
  tone = "light",
  priority = false,
  sizes = "100vw",
  focus = "50% 50%",
  fallback,
  children,
}: {
  image?: Img | null;
  style?: React.CSSProperties;
  tone?: "light" | "dark" | "warm";
  priority?: boolean;
  sizes?: string;
  focus?: string;
  /** Seed (usually the slug) for generated cover art when there is no image. Omit for photo slots like portraits. */
  fallback?: string;
  children?: ReactNode;
}) {
  const bg = tone === "dark" ? "var(--navy-2)" : tone === "warm" ? "var(--placeholder-2)" : "var(--placeholder)";
  return (
    <div className="placeholder" style={{ background: bg, ...style }} aria-hidden={image ? undefined : true}>
      {!image && fallback && <CoverArt seed={fallback} tone={tone === "dark" ? "dark" : "light"} />}
      {image && (
        // Plain <img>: media lives on Blob Storage with immutable caching; no optimiser container needed.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image.url} alt={image.alt} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" sizes={sizes} width={image.width ?? undefined} height={image.height ?? undefined} style={{ objectPosition: focus }} />
      )}
      {children}
    </div>
  );
}

export function SectionIntro({ eyebrow, title, children, action }: { eyebrow: string; title: string; children?: ReactNode; action?: { href: string; label: string; primary?: boolean } }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="display h-1" style={{ fontSize: 48, lineHeight: 1.04 }}>
        {title}
      </h2>
      {children}
      {action && (
        <Link className={action.primary ? "pill" : "pill ghost"} href={action.href} style={{ alignSelf: "flex-start" }}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span className="display" style={{ fontSize: 22 }}>
        {title}
      </span>
      {children && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "var(--muted)" }}>{children}</p>}
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" style={{ margin: 0, fontSize: 14, color: "var(--muted)", background: "var(--card)", borderRadius: 14, padding: "12px 16px" }}>
      {children}
    </p>
  );
}
