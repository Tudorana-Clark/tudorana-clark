import { getPublished } from "@/lib/api";
import { sectionFor } from "@/lib/content";
import { toMarkdown } from "@/lib/feeds";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Served at /<section>/<slug>.md via a rewrite: a clean, citable Markdown twin of every page. */
export async function GET(_req: Request, { params }: { params: Promise<{ section: string; slug: string }> }) {
  const { section, slug } = await params;
  const c = await getPublished(slug).catch(() => undefined);
  if (c === undefined) return new Response("Temporarily unavailable", { status: 503, headers: { "retry-after": "60" } });
  if (!c || sectionFor(c.kind) !== section) return new Response("Not found", { status: 404 });
  return new Response(toMarkdown(c), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=600",
      link: `<${absoluteUrl(`/${section}/${slug}`)}>; rel="canonical"`,
      "x-robots-tag": "noindex", // the HTML page is canonical; this twin is for LLM fetchers
    },
  });
}
