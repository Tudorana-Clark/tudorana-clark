import { llmsTxt } from "@/lib/feeds";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return new Response(await llmsTxt(), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=600" } });
  } catch {
    return new Response("Temporarily unavailable", { status: 503, headers: { "retry-after": "60" } });
  }
}
