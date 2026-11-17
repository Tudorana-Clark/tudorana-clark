import type { TagSuggestions } from "@/components/studio/TagInput";

import type { ContentSummary } from "./types";

/** Build tag suggestions from all content: recent = newest edits first, used = by frequency. */
export function tagSuggestions(items: ContentSummary[], excludeId?: string): TagSuggestions {
  const others = items.filter((i) => i.id !== excludeId);
  const canonical = new Map<string, string>(); // lowercase -> first-seen spelling (from newest)
  const counts = new Map<string, number>();
  const recent: string[] = [];

  for (const item of [...others].sort((a, b) => b.updated_at.localeCompare(a.updated_at))) {
    for (const tag of item.tags) {
      const key = tag.toLowerCase();
      if (!canonical.has(key)) canonical.set(key, tag);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (recent.length < 8 && !recent.some((r) => r.toLowerCase() === key)) recent.push(canonical.get(key)!);
    }
  }

  const used = [...counts.entries()]
    .map(([key, count]) => ({ tag: canonical.get(key)!, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  return { recent, used };
}
