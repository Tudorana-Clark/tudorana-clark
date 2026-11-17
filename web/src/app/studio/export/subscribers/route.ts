import { cookies } from "next/headers";

import { admin } from "@/lib/api";
import { env } from "@/lib/env";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const csv = (v: string) => `"${v.replace(/"/g, '""')}"`;

export async function GET() {
  if (!(await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value, env.SESSION_SECRET))) return new Response("Unauthorized", { status: 401 });
  try {
    const rows = await admin.subscribers();
    const body = ["email,source,subscribed_at", ...rows.map((s) => [s.email, s.source, s.created_at].map(csv).join(","))].join("\n");
    return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="subscribers-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
  } catch {
    return new Response("Export failed. Try again.", { status: 503 });
  }
}
