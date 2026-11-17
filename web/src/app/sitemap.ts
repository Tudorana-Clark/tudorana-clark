import type { MetadataRoute } from "next";

import { listPublishedSafe } from "@/lib/api";
import { pathFor } from "@/lib/content";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { items } = await listPublishedSafe(undefined, 200);
  const latest = items[0]?.updated_at ? new Date(items[0].updated_at) : new Date();
  const statics: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: latest, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/writing"), lastModified: latest, changeFrequency: "weekly", priority: 0.9 },
    { url: absoluteUrl("/research"), lastModified: latest, changeFrequency: "monthly", priority: 0.8 },
    { url: absoluteUrl("/speaking"), lastModified: latest, changeFrequency: "monthly", priority: 0.7 },
    { url: absoluteUrl("/about"), changeFrequency: "monthly", priority: 0.7 },
  ];
  return [
    ...statics,
    ...items.map((c) => ({
      url: absoluteUrl(pathFor(c)),
      lastModified: new Date(c.updated_at),
      changeFrequency: "monthly" as const,
      priority: c.kind === "article" || c.kind === "research" ? 0.8 : 0.6,
      images: c.feature_image ? [c.feature_image.url] : undefined,
    })),
  ];
}
