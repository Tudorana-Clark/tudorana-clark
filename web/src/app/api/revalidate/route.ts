import { timingSafeEqual } from "node:crypto";

import { revalidateTag } from "next/cache";

import { CONTENT_TAG } from "@/lib/api";
import { env } from "@/lib/env";

/**
 * Expire cached content now. For edits made outside the studio (scripts, imports, the API directly).
 *   curl -X POST -H "x-admin-key: $ADMIN_API_KEY" <site>/api/revalidate
 */
export async function POST(request: Request) {
  const given = Buffer.from(request.headers.get("x-admin-key") ?? "");
  const expected = Buffer.from(env.ADMIN_API_KEY);
  if (!expected.length || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  revalidateTag(CONTENT_TAG, { expire: 0 });
  return Response.json({ ok: true, revalidated: CONTENT_TAG });
}
