import "server-only";

import { createRemoteJWKSet, jwtVerify } from "jose";

import { env } from "./env";
import { site } from "./site";

/**
 * Microsoft Entra ID sign-in for the studio: OpenID Connect authorisation code flow with PKCE,
 * single tenant, and an allow-list of user object IDs (OIDs are immutable; emails are not).
 */

export const OIDC_COOKIE = "tc_oidc";
export const OIDC_TTL_SECONDS = 600;

export function ssoConfigured(): boolean {
  return Boolean(env.ENTRA_TENANT_ID && env.ENTRA_CLIENT_ID && env.ENTRA_CLIENT_SECRET && allowedOids().size);
}

function allowedOids(): Set<string> {
  return new Set(env.STUDIO_ALLOWED_OIDS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

const authority = () => `https://login.microsoftonline.com/${env.ENTRA_TENANT_ID}`;
export const redirectUri = () => `${site.url}/studio/auth/callback`;

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
const keys = () => (jwks ??= createRemoteJWKSet(new URL(`${authority()}/discovery/v2.0/keys`)));

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const random = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

export interface PendingLogin {
  state: string;
  nonce: string;
  verifier: string;
  next: string;
}

export async function startLogin(next: string): Promise<{ url: string; pending: PendingLogin }> {
  const pending: PendingLogin = { state: random(), nonce: random(), verifier: random(48), next };
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pending.verifier))));
  const params = new URLSearchParams({
    client_id: env.ENTRA_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    response_mode: "query",
    scope: "openid profile email",
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    login_hint: env.STUDIO_LOGIN_HINT,
  });
  if (!env.STUDIO_LOGIN_HINT) params.delete("login_hint");
  return { url: `${authority()}/oauth2/v2.0/authorize?${params}`, pending };
}

export type LoginResult = { ok: true; name: string } | { ok: false; reason: "denied" | "invalid" | "unavailable" };

/** Exchange the code, verify the ID token (signature, issuer, audience, nonce, tenant) and check the allow-list. */
export async function finishLogin(code: string, pending: PendingLogin): Promise<LoginResult> {
  let idToken: string;
  try {
    const res = await fetch(`${authority()}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.ENTRA_CLIENT_ID,
        client_secret: env.ENTRA_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(),
        code_verifier: pending.verifier,
        scope: "openid profile email",
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const body = (await res.json()) as { id_token?: string; error?: string; error_description?: string };
    if (!res.ok || !body.id_token) {
      console.error(JSON.stringify({ msg: "sso_token_exchange_failed", status: res.status, error: body.error }));
      return { ok: false, reason: "invalid" };
    }
    idToken = body.id_token;
  } catch (err) {
    console.error(JSON.stringify({ msg: "sso_unreachable", error: String(err) }));
    return { ok: false, reason: "unavailable" };
  }

  try {
    const { payload } = await jwtVerify(idToken, keys(), {
      issuer: `${authority()}/v2.0`,
      audience: env.ENTRA_CLIENT_ID,
      clockTolerance: 60,
    });
    if (payload.nonce !== pending.nonce || payload.tid !== env.ENTRA_TENANT_ID) return { ok: false, reason: "invalid" };
    const oid = String(payload.oid ?? "").toLowerCase();
    if (!allowedOids().has(oid)) {
      console.warn(JSON.stringify({ msg: "sso_denied", oid }));
      return { ok: false, reason: "denied" };
    }
    console.info(JSON.stringify({ msg: "sso_login", oid }));
    return { ok: true, name: String(payload.name ?? "") };
  } catch (err) {
    console.error(JSON.stringify({ msg: "sso_token_invalid", error: String(err) }));
    return { ok: false, reason: "invalid" };
  }
}
