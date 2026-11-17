import { connection } from "next/server";

import { PostEditor } from "@/components/studio/PostEditor";
import { admin, studio } from "@/lib/api";
import { pathFor } from "@/lib/content";
import { blankPost, type PostInput } from "@/lib/types";

/** New post, optionally seeded from an idea (?idea=) or recycled from a published piece (?from=). */
export default async function NewPostPage({ searchParams }: { searchParams: Promise<{ idea?: string; from?: string }> }) {
  await connection();
  const { idea, from } = await searchParams;
  let initial: PostInput = blankPost();
  if (idea) {
    const found = (await studio.ideas().catch(() => [])).find((i) => i.id === idea);
    if (found) initial = blankPost(found.text, found.source, found.id);
  } else if (from) {
    const c = await admin.get(from).catch(() => null);
    if (c) initial = blankPost(c.seo.tldr || c.excerpt || c.title, { content_id: c.id, kind: c.kind, title: c.title, path: pathFor(c) }, null);
  }
  return <PostEditor initial={initial} />;
}
