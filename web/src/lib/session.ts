/**
 * Stateless studio session: `<expiry>.<hmac>` signed with SESSION_SECRET.
 * Uses Web Crypto so it runs in both the proxy and server actions.
 */

export const SESSION_COOKIE = "tc_studio";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

const encoder = new TextEncoder();

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Buffer.from(sig).toString("base64url");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(secret: string, now = Date.now()): Promise<string> {
  const expires = String(Math.floor(now / 1000) + SESSION_TTL_SECONDS);
  return `${expires}.${await hmac(secret, `studio:${expires}`)}`;
}

export async function verifySessionToken(token: string | undefined, secret: string, now = Date.now()): Promise<boolean> {
  if (!token || !secret) return false;
  const [expires, sig] = token.split(".");
  if (!expires || !sig || Number(expires) * 1000 < now) return false;
  return timingSafeEqual(sig, await hmac(secret, `studio:${expires}`));
}

export async function passwordMatches(input: string, expected: string, secret: string): Promise<boolean> {
  if (!expected) return false;
  // Compare HMACs so length and early-exit timing reveal nothing about the password.
  const [a, b] = await Promise.all([hmac(secret, input), hmac(secret, expected)]);
  return timingSafeEqual(a, b);
}
