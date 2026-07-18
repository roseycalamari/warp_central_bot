import { NextRequest, NextResponse } from "next/server";
import { publishPostNow } from "@/lib/publisher";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Force-publish a single queued post right now. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = body.id as string;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const result = await publishPostNow(id);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
