import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ApiError } from "./api";
import { env } from "./env";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/** Every studio server action calls this first; the proxy only guards page loads. */
export async function requireSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(token, env.SESSION_SECRET))) redirect("/studio/login");
}

/** Map any failure to a message that is safe to show, logging the unexpected ones. */
export function fail(err: unknown): { ok: false; error: string } {
  if (err instanceof ApiError) return { ok: false, error: err.message };
  console.error(JSON.stringify({ msg: "studio_action_failed", error: String(err) }));
  return { ok: false, error: "Something went wrong. Your changes are still in the editor — try again." };
}
