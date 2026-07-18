import { createHmac, timingSafeEqual } from "node:crypto";

export const AUTH_COOKIE = "warp_session";

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

export function sessionTokenForPassword(password: string) {
  return createHmac("sha256", authSecret())
    .update(`warp-central:${password}`)
    .digest("hex");
}

export function expectedSessionToken() {
  const password = process.env.SITE_PASSWORD?.trim();
  if (!password) return null;
  return sessionTokenForPassword(password);
}

export function isValidSessionToken(token: string | undefined | null) {
  const expected = expectedSessionToken();
  if (!expected || !token) return false;
  try {
    const a = Buffer.from(token);
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
