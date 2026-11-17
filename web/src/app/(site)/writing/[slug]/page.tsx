import { notFound, permanentRedirect } from "next/navigation";

import { getPublished } from "@/lib/api";
import { pathFor } from "@/lib/content";

/** Old address: /writing/<slug> → /<slug> (permanent, so search engines move the ranking). */
export default async function LegacyWritingPath({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await getPublished(slug);
  if (!c) notFound();
  permanentRedirect(pathFor(c));
}
