import { type NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/** Gate the studio. Server actions re-check the session too; this just keeps pages private. */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/studio/login" || pathname.startsWith("/studio/auth/")) return NextResponse.next();

  const ok = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET ?? "");
  if (ok) return NextResponse.next();

  const login = new URL("/studio/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/studio", "/studio/:path*"] };
