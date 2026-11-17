import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { LOGO_PATH } from "@/components/Logo";

import { getPublished } from "./api";
import { formatLong, KIND_LABEL } from "./content";
import { site } from "./site";

export const OG_SIZE = { width: 1200, height: 630 };

const fonts = Promise.all([
  readFile(join(process.cwd(), "src/assets/InterTight-500.ttf")),
  readFile(join(process.cwd(), "src/assets/Inter-400.ttf")),
]).then(([display, body]) => [
  { name: "Inter Tight", data: display, weight: 500 as const, style: "normal" as const },
  { name: "Inter", data: body, weight: 400 as const, style: "normal" as const },
]);

interface Card {
  kicker: string;
  title: string;
  meta: string;
  image?: string | null;
  dark?: boolean;
}

/** Branded 1200×630 share card in the site's design language (navy research, light articles). */
export async function renderCard({ kicker, title, meta, image, dark }: Card): Promise<ImageResponse> {
  const ink = dark ? "#FFFFFF" : "#0E1520";
  const accent = dark ? "#C9A55E" : "#8A6A2B";
  const titleSize = title.length > 80 ? 52 : title.length > 50 ? 62 : 72;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: dark ? "#14233C" : "#F3F3F0", padding: 32, fontFamily: "Inter" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", background: dark ? "#14233C" : "#FFFFFF", borderRadius: 28, padding: 56 }}>
          <svg viewBox="0 -2 1432 72" width={330} height={17}>
            <path fill={ink} fillRule="evenodd" d={LOGO_PATH} />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ fontSize: 22, color: accent, letterSpacing: 1, textTransform: "uppercase" }}>{kicker}</div>
            <div style={{ fontFamily: "Inter Tight", fontSize: titleSize, lineHeight: 1.04, letterSpacing: -2.5, color: ink, maxWidth: image ? 640 : 1000 }}>{title}</div>
          </div>
          <div style={{ fontSize: 22, color: dark ? "#B9C0CC" : "#5E636B" }}>{meta}</div>
        </div>
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" width={380} height={566} style={{ marginLeft: 16, borderRadius: 28, objectFit: "cover" }} />
        )}
      </div>
    ),
    { ...OG_SIZE, fonts: await fonts, headers: { "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}

export async function renderContentCard(slug: string): Promise<ImageResponse> {
  const c = await getPublished(slug).catch(() => null);
  if (!c) return renderCard({ kicker: site.name, title: "Insights on AI, technology, business and the economy.", meta: site.author });
  const meta = [site.author, formatLong(c.published_at)].filter(Boolean).join("  ·  ");
  const image = c.feature_image?.url && /\.(png|jpe?g)$/i.test(c.feature_image.url) ? c.feature_image.url : null; // satori decodes PNG/JPEG only
  return renderCard({ kicker: c.kind === "talk" ? c.event?.name || "Talk" : c.category || KIND_LABEL[c.kind], title: c.title, meta, image, dark: c.kind === "research" });
}

export const QUOTE_FORMATS = { square: { width: 1080, height: 1080 }, landscape: { width: 1200, height: 675 } } as const;
export type QuoteFormat = keyof typeof QUOTE_FORMATS;

export interface QuoteSegment {
  text: string;
  boxed: boolean;
}

/** Split a quote line on <box>…</box> markers. Unclosed or stray tags are dropped, never rendered. */
export function parseQuote(raw: string): QuoteSegment[] {
  const segments: QuoteSegment[] = [];
  const re = /<box>([\s\S]*?)<\/box>/gi;
  let last = 0;
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    if (m.index > last) segments.push({ text: raw.slice(last, m.index), boxed: false });
    segments.push({ text: m[1] ?? "", boxed: true });
    last = m.index + m[0].length;
  }
  segments.push({ text: raw.slice(last), boxed: false });
  return segments.map((seg) => ({ ...seg, text: seg.text.replace(/<\/?box>/gi, "") })).filter((seg) => seg.text.trim());
}

/** The quote line without markup, for alt text and length checks. */
export function plainQuote(raw: string): string {
  return raw.replace(/<\/?box>/gi, "").replace(/\s+/g, " ").trim();
}

/** Branded quote card for short-form posts (LinkedIn/X): the line itself, with optional gold highlight boxes, and the logo. */
export async function renderQuoteCard({ text, format, dark, download }: { text: string; format: QuoteFormat; dark: boolean; download: boolean }): Promise<ImageResponse> {
  const size = QUOTE_FORMATS[format];
  const ink = dark ? "#FFFFFF" : "#0E1520";
  const gold = "#C9A55E";
  const square = format === "square";
  const len = plainQuote(text).length;
  const fontSize = square ? (len > 160 ? 56 : len > 100 ? 66 : 80) : len > 160 ? 46 : len > 100 ? 54 : 64;
  // Words are separate flex items so lines wrap naturally; a boxed phrase stays together as one highlighted unit.
  const pieces = parseQuote(text).flatMap((seg, i) =>
    seg.boxed
      ? [
          <span key={`b${i}`} style={{ background: gold, color: "#0E1520", padding: "0 0.16em", borderRadius: 8, marginRight: "0.24em" }}>
            {seg.text.trim()}
          </span>,
        ]
      : seg.text
          .split(/\s+/)
          .filter(Boolean)
          .map((w, j) => (
            <span key={`w${i}-${j}`} style={{ marginRight: "0.24em" }}>
              {w}
            </span>
          )),
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: dark ? "#14233C" : "#F3F3F0", padding: square ? 40 : 32, fontFamily: "Inter" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: dark ? "#14233C" : "#FFFFFF", borderRadius: 28, padding: square ? 72 : 56 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexWrap: "wrap", rowGap: fontSize * 0.14, fontFamily: "Inter Tight", fontSize, lineHeight: 1.12, letterSpacing: -1.5, color: ink }}>{pieces}</div>
          </div>
          <svg viewBox="0 -2 1432 72" width={square ? 300 : 260} height={square ? 15 : 13}>
            <path fill={ink} fillRule="evenodd" d={LOGO_PATH} />
          </svg>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: await fonts,
      headers: {
        "cache-control": "private, max-age=300",
        ...(download ? { "content-disposition": `attachment; filename="quote-${format}.png"` } : {}),
      },
    },
  );
}
