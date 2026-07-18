import { NextRequest, NextResponse } from "next/server";
import { syncDeletedFromInstagram } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  if (process.env.NODE_ENV !== "production") return true;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}

/** Manual sync from the UI (dev + production). */
export async function POST() {
  try {
    const result = await syncDeletedFromInstagram({ limit: 50 });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Optional cron: /api/sync?secret=... */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return POST();
}
