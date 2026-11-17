import "server-only";

import { listPublishedSafe } from "./api";
import type { Content, ContentSummary } from "./types";

/**
 * "Keep reading": rank by shared tags, then recency. Always mixes in the latest research
 * so readers (and crawlers) find the deeper work. Never throws.
 */
export async function connectionSafeList(current: Content): Promise<ContentSummary[]> {
  const [articles, research] = await Promise.all([listPublishedSafe("article", 30), listPublishedSafe("research", 3)]);
  const tags = new Set(current.tags.map((t) => t.toLowerCase()));
  const score = (c: ContentSummary) => c.tags.filter((t) => tags.has(t.toLowerCase())).length;
  const others = articles.items.filter((a) => a.id !== current.id).sort((a, b) => score(b) - score(a) || (b.published_at ?? "").localeCompare(a.published_at ?? ""));
  const paper = research.items.find((r) => r.id !== current.id);
  return paper ? [others[0], paper].filter((x): x is ContentSummary => Boolean(x)) : others.slice(0, 2);
}
