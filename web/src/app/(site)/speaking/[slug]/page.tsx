import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { ContentArticle } from "@/components/ContentArticle";
import { getPublished } from "@/lib/api";
import { pathFor, sectionFor } from "@/lib/content";
import { contentMetadata } from "@/lib/page-meta";

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const c = await getPublished(slug);
  if (!c) notFound();
  if (sectionFor(c.kind) !== "speaking") permanentRedirect(pathFor(c));
  return c;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return contentMetadata(await load((await params).slug));
}

export default async function SpeakingDetailPage({ params }: Props) {
  return <ContentArticle content={await load((await params).slug)} />;
}
