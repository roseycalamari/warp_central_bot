import { NextRequest, NextResponse } from "next/server";

export const AUTH_COOKIE = "warp_session";

const ALLOWED_USERS = ["andre", "ruben"] as const;

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

function isAllowedUser(username: string): username is (typeof ALLOWED_USERS)[number] {
  return (ALLOWED_USERS as readonly string[]).includes(username);
}

async function isValidSessionCookie(raw: string | undefined) {
  const password = process.env.SITE_PASSWORD?.trim();
  if (!password || !raw) return false;

  const dot = raw.indexOf(".");
  if (dot <= 0 || dot === raw.length - 1) return false;

  const username = raw.slice(0, dot).toLowerCase();
  const token = raw.slice(dot + 1);
  if (!isAllowedUser(username)) return false;

  const expected = await hmacHex(`warp-central:v2:${username}:${password}`);
  return timingSafeEqualHex(token, expected);
}

function hasValidCronSecret(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  // Some Vercel setups expose the cron secret this way
  if (req.headers.get("x-vercel-cron-secret") === secret) return true;
  if (req.nextUrl.searchParams.get("secret") === secret) return true;
  return false;
}

function unauthorizedApi() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function redirectToLogin(req: NextRequest) {
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public / system paths only (login itself + static assets)
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/fonts") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.png" ||
    pathname === "/apple-icon.png" ||
    pathname === "/favicon-32.png" ||
    pathname === "/apple-touch-icon.png" ||
    pathname === "/warp_logo.png"
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

  // No SITE_PASSWORD → lock the app (never leave it open via the link alone)
  if (!process.env.SITE_PASSWORD?.trim()) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "SITE_PASSWORD is not configured" },
        { status: 503 },
      );
    }
    return redirectToLogin(req);
  }

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (await isValidSessionCookie(cookie)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return unauthorizedApi();
  }

  return redirectToLogin(req);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
