import { NextRequest, NextResponse } from "next/server";
import { publishDuePosts } from "@/lib/publisher";
import { syncDeletedFromInstagram } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;

  // Vercel Cron also sends this header on Hobby/Pro cron invocations
  const cronHeader = req.headers.get("x-vercel-cron-secret");
  if (cronHeader && cronHeader === secret) return true;

  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;

  return false;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1 post per tick keeps Meta + Blob under cron timeouts (esp. cron-job.org ~30s)
    const published = await publishDuePosts({ limit: 1 });

    // Sync is secondary — never block publishing if IG checks are slow
    let synced: Awaited<ReturnType<typeof syncDeletedFromInstagram>> | null =
      null;
    const minute = new Date().getUTCMinutes();
    if (published.processed === 0 && minute % 15 === 0) {
      try {
        synced = await syncDeletedFromInstagram({ limit: 5 });
      } catch (err) {
        synced = {
          checked: 0,
          removed: 0,
          kept: 0,
          removedIds: [],
          errors: [
            {
              id: "sync",
              error: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    }

    return NextResponse.json({
      ok: true,
      at: new Date().toISOString(),
      published,
      synced,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
