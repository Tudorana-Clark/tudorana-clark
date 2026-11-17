import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { OIDC_COOKIE, OIDC_TTL_SECONDS, ssoConfigured, startLogin } from "@/lib/oidc";
import { sign } from "@/lib/signed-cookie";
import { site } from "@/lib/site";

/** Starts Microsoft sign-in. The PKCE verifier, state and nonce ride in a short-lived signed cookie. */
export async function GET(request: Request) {
  if (!ssoConfigured()) return NextResponse.redirect(`${site.url}/studio/login?error=unavailable`);
  const requested = new URL(request.url).searchParams.get("next") ?? "/studio";
  const next = requested.startsWith("/studio") && !requested.startsWith("/studio/auth") ? requested : "/studio";
  const { url, pending } = await startLogin(next);
  const res = NextResponse.redirect(url);
  res.cookies.set(OIDC_COOKIE, sign(pending, env.SESSION_SECRET), {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax", // must survive the top-level redirect back from Microsoft
    path: "/studio/auth",
    maxAge: OIDC_TTL_SECONDS,
  });
  return res;
}
