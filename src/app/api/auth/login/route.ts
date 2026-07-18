import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  buildSessionCookie,
  sitePasswordConfigured,
  verifyLogin,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!sitePasswordConfigured()) {
    return NextResponse.json(
      { error: "SITE_PASSWORD is not configured on the server" },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const username = String(body.username || "");
  const password = String(body.password || "");

  const user = verifyLogin(username, password);
  if (!user) {
    return NextResponse.json(
      { error: "Wrong username or password" },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ ok: true, user });
  res.cookies.set(AUTH_COOKIE, buildSessionCookie(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
