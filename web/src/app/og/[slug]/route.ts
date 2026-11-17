import { renderContentCard } from "@/lib/og";

/** Stable share-card URL for structured data (file-based OG routes carry a build hash). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return new Response("Not found", { status: 404 });
  return renderContentCard(slug);
}
