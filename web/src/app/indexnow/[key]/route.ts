import { env } from "@/lib/env";

/** IndexNow key verification file, served at /<key>.txt via a rewrite. */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!env.INDEXNOW_KEY || key !== env.INDEXNOW_KEY) return new Response("Not found", { status: 404 });
  return new Response(env.INDEXNOW_KEY, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
