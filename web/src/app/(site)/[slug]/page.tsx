import { notFound, permanentRedirect } from "next/navigation";

import { getPublished } from "@/lib/api";
import { pathFor } from "@/lib/content";

/**
 * Ghost served posts at /<slug>/. Send those links (and their search rankings) to the
 * piece's new home, e.g. /writing/<slug>. Unknown slugs get a real 404.
 */
export default async function LegacySlug({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();
  const content = await getPublished(slug);
  if (!content) notFound();
  permanentRedirect(pathFor(content));
}
