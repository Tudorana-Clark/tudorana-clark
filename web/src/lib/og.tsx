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
  const meta = [site.author, formatLong(c.published_at), c.kind === "article" ? `${c.reading_minutes} min read` : null].filter(Boolean).join("  ·  ");
  const image = c.feature_image?.url && /\.(png|jpe?g)$/i.test(c.feature_image.url) ? c.feature_image.url : null; // satori decodes PNG/JPEG only
  return renderCard({ kicker: c.kind === "talk" ? c.event?.name || "Talk" : c.category || KIND_LABEL[c.kind], title: c.title, meta, image, dark: c.kind === "research" });
}
