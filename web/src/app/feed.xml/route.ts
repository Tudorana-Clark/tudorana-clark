import { rssFeed } from "@/lib/feeds";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return new Response(await rssFeed(), { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=600, s-maxage=600" } });
  } catch {
    return new Response("Feed temporarily unavailable", { status: 503, headers: { "retry-after": "60" } });
  }
}
