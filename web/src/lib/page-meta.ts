import type { Metadata } from "next";

import { pathFor } from "./content";
import { site } from "./site";
import type { Content } from "./types";

/** Full metadata for a single piece: canonical, Open Graph article, X card, markdown alternate. */
export function contentMetadata(c: Content): Metadata {
  const path = pathFor(c);
  const title = c.seo.meta_title || c.title;
  const description = c.seo.meta_description || c.excerpt || c.subtitle;
  const keywords = c.seo.keywords.length ? c.seo.keywords : c.tags;
  return {
    title: { absolute: `${title} · ${site.name}` },
    description,
    keywords,
    authors: [{ name: site.author, url: `${site.url}/about` }],
    category: c.category || undefined,
    alternates: {
      canonical: path,
      types: { "text/markdown": [{ url: `${path}.md`, title: "Markdown version" }] },
    },
    openGraph: {
      type: c.kind === "video" ? "video.other" : "article",
      url: path,
      title,
      description,
      siteName: site.name,
      locale: site.locale,
      publishedTime: c.published_at ?? undefined,
      modifiedTime: c.updated_at,
      authors: [`${site.url}/about`],
      section: c.category || undefined,
      tags: c.tags,
      ...(c.video ? { videos: [{ url: c.video.embed_url }] } : {}),
    },
    twitter: { card: "summary_large_image", title, description, creator: site.social.xHandle, site: site.social.xHandle },
    other: {
      // LinkedIn and Slack read these; AI crawlers use them to date and attribute claims.
      author: site.author,
      "article:author": site.author,
    },
  };
}
