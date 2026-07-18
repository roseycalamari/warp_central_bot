import { NextRequest, NextResponse } from "next/server";

export const AUTH_COOKIE = "warp_session";

function authSecret() {
  return (
    process.env.AUTH_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.SITE_PASSWORD?.trim() ||
    "warp-dev-secret"
  );
}

async function hmacHex(message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

async function expectedSessionToken() {
  const password = process.env.SITE_PASSWORD?.trim();
  if (!password) return null;
  return hmacHex(`warp-central:${password}`);
}

function hasValidCronSecret(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  if (req.nextUrl.searchParams.get("secret") === secret) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // No password configured → open app (set SITE_PASSWORD on Vercel to lock it)
  if (!process.env.SITE_PASSWORD?.trim()) {
    return NextResponse.next();
  }

  // Public / system paths
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/fonts") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.png" ||
    pathname === "/warp_logo.png" ||
    pathname.startsWith("/uploads")
  ) {
    return NextResponse.next();
  }

  // Cron / automation can use CRON_SECRET without logging in
  if (
    (pathname.startsWith("/api/publish") || pathname.startsWith("/api/sync")) &&
    hasValidCronSecret(req)
  ) {
    return NextResponse.next();
  }

  const expected = await expectedSessionToken();
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (expected && cookie && timingSafeEqualHex(cookie, expected)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
