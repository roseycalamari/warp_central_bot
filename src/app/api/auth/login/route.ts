import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  sessionTokenForPassword,
  sitePasswordConfigured,
  verifyPassword,
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
  const password = String(body.password || "");

  if (!verifyPassword(password)) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const token = sessionTokenForPassword(password);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
