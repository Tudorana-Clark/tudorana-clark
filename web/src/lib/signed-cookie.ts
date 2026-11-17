import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/** Tamper-proof JSON in a cookie: base64url(payload).hmac(SESSION_SECRET). */
export function sign(value: unknown, secret: string): string {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function unsign<T>(token: string | undefined, secret: string): T | null {
  if (!token || !secret) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()) as T;
  } catch {
    return null;
  }
}
