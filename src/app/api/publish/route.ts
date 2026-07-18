import { NextRequest, NextResponse } from "next/server";
import { publishDuePosts } from "@/lib/publisher";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // Allow in local/dev when secret is not configured yet
    return process.env.NODE_ENV !== "production";
  }

  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;

  // Some external cron tools send the secret as a query param
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;

  return false;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await publishDuePosts({ limit: 2 });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
