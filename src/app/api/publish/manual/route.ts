import { NextResponse } from "next/server";
import { publishDuePosts } from "@/lib/publisher";

export const runtime = "nodejs";
export const maxDuration = 60;

/** UI "Publish due now" — no cron secret needed (personal tool). */
export async function POST() {
  try {
    // Higher limit for manual / in-app keepalive catch-up
    const result = await publishDuePosts({ limit: 5 });
    return NextResponse.json({ ok: true, at: new Date().toISOString(), ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
