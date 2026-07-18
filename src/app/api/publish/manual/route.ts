import { NextResponse } from "next/server";
import { publishDuePosts } from "@/lib/publisher";

export const runtime = "nodejs";
export const maxDuration = 60;

/** UI "Publish due now" — no cron secret needed (personal tool). */
export async function POST() {
  try {
    const result = await publishDuePosts({ limit: 2 });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
