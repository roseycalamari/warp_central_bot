import { createHmac, timingSafeEqual } from "node:crypto";

export const AUTH_COOKIE = "warp_session";

/** Only these usernames can log in (same shared SITE_PASSWORD). */
export const ALLOWED_USERS = ["andre", "ruben"] as const;
export type AllowedUser = (typeof ALLOWED_USERS)[number];

function authSecret() {
  return (
    process.env.AUTH_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.SITE_PASSWORD?.trim() ||
    "warp-dev-secret"
  );
}

export function sitePasswordConfigured() {
  return Boolean(process.env.SITE_PASSWORD?.trim());
}

export function normalizeUsername(raw: string) {
  return raw.trim().toLowerCase();
}

export function isAllowedUser(username: string): username is AllowedUser {
  return (ALLOWED_USERS as readonly string[]).includes(username);
}

export function sessionTokenForUser(username: AllowedUser) {
  const password = process.env.SITE_PASSWORD?.trim() || "";
  return createHmac("sha256", authSecret())
    .update(`warp-central:v2:${username}:${password}`)
    .digest("hex");
}

/** Cookie value: username.hmac */
export function buildSessionCookie(username: AllowedUser) {
  return `${username}.${sessionTokenForUser(username)}`;
}

export function parseSessionCookie(raw: string | undefined | null): {
  username: string;
  token: string;
} | null {
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot <= 0 || dot === raw.length - 1) return null;
  return {
    username: raw.slice(0, dot).toLowerCase(),
    token: raw.slice(dot + 1),
  };
}

export function isValidSessionCookie(raw: string | undefined | null) {
  if (!sitePasswordConfigured()) return false;
  const parsed = parseSessionCookie(raw);
  if (!parsed || !isAllowedUser(parsed.username)) return false;
  const expected = sessionTokenForUser(parsed.username);
  try {
    const a = Buffer.from(parsed.token);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyPassword(password: string) {
  const expected = process.env.SITE_PASSWORD?.trim();
  if (!expected) return false;
  try {
    const a = Buffer.from(password);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyLogin(usernameRaw: string, password: string) {
  const username = normalizeUsername(usernameRaw);
  if (!isAllowedUser(username)) return null;
  if (!verifyPassword(password)) return null;
  return username;
}
