import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { finishLogin, OIDC_COOKIE, type PendingLogin } from "@/lib/oidc";
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/session";
import { unsign } from "@/lib/signed-cookie";
import { site } from "@/lib/site";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const pending = unsign<PendingLogin>((await cookies()).get(OIDC_COOKIE)?.value, env.SESSION_SECRET);

  const fail = (reason: string) => {
    const res = NextResponse.redirect(`${site.url}/studio/login?error=${reason}`);
    res.cookies.delete({ name: OIDC_COOKIE, path: "/studio/auth" });
    return res;
  };

  if (params.get("error")) return fail(params.get("error") === "access_denied" ? "denied" : "invalid");
  const code = params.get("code");
  if (!pending || !code || params.get("state") !== pending.state) return fail("expired");

  const result = await finishLogin(code, pending);
  if (!result.ok) return fail(result.reason);

  const res = NextResponse.redirect(`${site.url}${pending.next}`);
  res.cookies.delete({ name: OIDC_COOKIE, path: "/studio/auth" });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(env.SESSION_SECRET), {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
