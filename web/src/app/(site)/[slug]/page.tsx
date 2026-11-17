import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { ContentArticle } from "@/components/ContentArticle";
import { getPublished } from "@/lib/api";
import { pathFor, sectionFor } from "@/lib/content";
import { contentMetadata } from "@/lib/page-meta";

type Props = { params: Promise<{ slug: string }> };

/**
 * Writing (articles and notes) lives at the root: /<slug>, matching the Ghost-era URLs.
 * Other kinds reached here (e.g. old Ghost links to talks) redirect to their section.
 */
async function load(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();
  const c = await getPublished(slug);
  if (!c) notFound();
  if (sectionFor(c.kind) !== "writing") permanentRedirect(pathFor(c));
  return c;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return contentMetadata(await load((await params).slug));
}

export default async function WritingPage({ params }: Props) {
  return <ContentArticle content={await load((await params).slug)} />;
}
